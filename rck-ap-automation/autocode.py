#!/usr/bin/env python3
"""RCK AP automation: auto-code Xero draft bills.

Commands:
  fetch    Pull all DRAFT ACCPAY bills from Xero into out/drafts.json
  propose  Apply rules.json to drafts.json, write out/proposals.json (reviewable/editable)
  apply    Push proposals to Xero (bills stay DRAFT). --dry-run prints payloads only.
  report   Write an HTML report of what was applied to stdout.

Safety: only DRAFT purchase bills are touched; amounts are never changed; every bill is
re-fetched immediately before writing and skipped if no longer in Draft.
"""

import argparse
import datetime
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from xero_client import XeroClient, XeroError  # noqa: E402


def load_rules():
    with open(os.path.join(HERE, "rules.json")) as f:
        return json.load(f)


def read_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# --- rule engine ------------------------------------------------------------


def match_supplier_account(rules, supplier_name):
    name = (supplier_name or "").lower()
    for needle, code in rules["supplier_accounts"].items():
        if needle in name:
            return code
    return None


def match_keyword_override(rules, text):
    low = (text or "").lower()
    for needle, code in rules["keyword_overrides"].items():
        if needle in low:
            return code
    return None


def match_job(rules, *texts):
    blob = " ".join(t or "" for t in texts).lower()
    for needle, option in rules["job_keywords"].items():
        if needle in blob:
            return option
    return None


def propose_for_bill(rules, bill):
    supplier = (bill.get("Contact") or {}).get("Name", "")
    default_account = match_supplier_account(rules, supplier)
    inv_no = bill.get("InvoiceNumber") or ""
    reference = bill.get("Reference") or ""
    flags = []

    lines = []
    all_text = [inv_no, reference]
    for li in bill.get("LineItems", []):
        desc = li.get("Description") or ""
        all_text.append(desc)
        proposed = match_keyword_override(rules, desc) or default_account
        current = li.get("AccountCode")
        tracking = []
        division = rules["division_by_account"].get(proposed or "", None)
        if division:
            tracking.append(
                {"Name": rules["tracking_category_names"]["division"], "Option": division}
            )
        lines.append(
            {
                "line_item_id": li.get("LineItemID"),
                "description": desc,
                "quantity": li.get("Quantity"),
                "unit_amount": li.get("UnitAmount"),
                "line_amount": li.get("LineAmount"),
                "current_account": current,
                "proposed_account": proposed,
                "tax_type": li.get("TaxType") or rules["default_tax_type"],
                "tracking": tracking,
            }
        )

    if not default_account:
        flags.append(f"Unknown supplier '{supplier}' — account code needs human choice")

    job = match_job(rules, *all_text)
    new_invoice_number = None
    if job:
        job_cat = rules["tracking_category_names"]["job"]
        for line in lines:
            if not any(t["Name"] == job_cat for t in line["tracking"]):
                line["tracking"].append({"Name": job_cat, "Option": job})
        if job.lower() not in inv_no.lower():
            new_invoice_number = f"{inv_no} - {job}" if inv_no else None
    else:
        direct = {"8-1500", "8-200", "EMULSION", "SUB - A", "SUB - C", "LHIRE-A", "TRAFFIC", "Sub T", "8-2510"}
        if any((l["proposed_account"] or "") in direct for l in lines):
            flags.append("Direct job cost but no job detected — add job to title/tracking manually")

    changed = any(l["proposed_account"] and l["proposed_account"] != l["current_account"] for l in lines)
    changed = changed or bool(new_invoice_number) or any(l["tracking"] for l in lines)

    return {
        "invoice_id": bill.get("InvoiceID"),
        "invoice_number": inv_no,
        "new_invoice_number": new_invoice_number,
        "supplier": supplier,
        "date": bill.get("DateString") or bill.get("Date"),
        "total": bill.get("Total"),
        "lines": lines,
        "flags": flags,
        "skip": False,
        "has_changes": changed,
    }


# --- commands ---------------------------------------------------------------


def cmd_fetch(out_dir):
    client = XeroClient()
    bills = client.get_draft_bills()
    write_json(os.path.join(out_dir, "drafts.json"), bills)
    print(f"Fetched {len(bills)} draft bill(s) -> {out_dir}/drafts.json")


def cmd_propose(out_dir):
    rules = load_rules()
    bills = read_json(os.path.join(out_dir, "drafts.json"))
    proposals = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "bills": [propose_for_bill(rules, b) for b in bills],
    }
    write_json(os.path.join(out_dir, "proposals.json"), proposals)
    n = sum(1 for b in proposals["bills"] if b["has_changes"])
    f = sum(len(b["flags"]) for b in proposals["bills"])
    print(f"Proposed changes for {n}/{len(proposals['bills'])} bill(s), {f} flag(s) "
          f"-> {out_dir}/proposals.json")


def build_update_payload(fresh_bill, proposal):
    """Merge proposed coding into the freshly fetched bill. Returns None if unsafe."""
    if fresh_bill.get("Status") != "DRAFT":
        return None, f"no longer DRAFT (now {fresh_bill.get('Status')})"
    by_id = {l["line_item_id"]: l for l in proposal["lines"] if l.get("line_item_id")}
    out_lines = []
    for li in fresh_bill.get("LineItems", []):
        new_li = {
            "LineItemID": li.get("LineItemID"),
            "Description": li.get("Description"),
            "Quantity": li.get("Quantity"),
            "UnitAmount": li.get("UnitAmount"),
        }
        if li.get("LineAmount") is not None:
            new_li["LineAmount"] = li.get("LineAmount")
        prop = by_id.get(li.get("LineItemID"))
        if prop and prop.get("proposed_account"):
            new_li["AccountCode"] = prop["proposed_account"]
            new_li["TaxType"] = prop.get("tax_type") or li.get("TaxType")
            if prop.get("tracking"):
                new_li["Tracking"] = prop["tracking"]
        else:
            if li.get("AccountCode"):
                new_li["AccountCode"] = li.get("AccountCode")
            if li.get("TaxType"):
                new_li["TaxType"] = li.get("TaxType")
        out_lines.append(new_li)
    payload = {
        "InvoiceID": fresh_bill["InvoiceID"],
        "Type": "ACCPAY",
        "Status": "DRAFT",
        "LineItems": out_lines,
    }
    if proposal.get("new_invoice_number"):
        payload["InvoiceNumber"] = proposal["new_invoice_number"]
    return payload, None


def cmd_apply(out_dir, dry_run):
    proposals = read_json(os.path.join(out_dir, "proposals.json"))
    client = XeroClient()

    valid_codes = {a.get("Code") for a in client.get_accounts() if a.get("Code")}
    applied, skipped, errors = [], [], []

    for prop in proposals["bills"]:
        label = f"{prop['supplier']} {prop['invoice_number']}".strip()
        if prop.get("skip") or not prop.get("has_changes"):
            skipped.append({"bill": label, "reason": "skip flag or no changes"})
            continue
        bad = [l["proposed_account"] for l in prop["lines"]
               if l.get("proposed_account") and l["proposed_account"] not in valid_codes]
        if bad:
            errors.append({"bill": label, "error": f"unknown account code(s) {sorted(set(bad))}"})
            continue
        fresh = client.get_bill(prop["invoice_id"])
        if not fresh:
            errors.append({"bill": label, "error": "bill not found on re-fetch"})
            continue
        payload, reason = build_update_payload(fresh, prop)
        if payload is None:
            skipped.append({"bill": label, "reason": reason})
            continue
        if dry_run:
            print(f"[dry-run] would update {label}:")
            print(json.dumps(payload, indent=2))
            applied.append({"bill": label, "dry_run": True, "proposal": prop})
            continue
        try:
            resp = client.update_bills([payload])
            returned = (resp.get("Invoices") or [{}])[0]
            total_before, total_after = fresh.get("Total"), returned.get("Total")
            record = {
                "bill": label,
                "invoice_id": prop["invoice_id"],
                "new_invoice_number": prop.get("new_invoice_number"),
                "total_before": total_before,
                "total_after": total_after,
                "total_changed": total_before != total_after,
                "proposal": prop,
            }
            if returned.get("HasErrors") or returned.get("ValidationErrors"):
                record["validation_errors"] = returned.get("ValidationErrors")
                errors.append({"bill": label, "error": str(returned.get("ValidationErrors"))})
            else:
                applied.append(record)
            if record.get("total_changed"):
                print(f"WARNING: total changed on {label}: {total_before} -> {total_after}",
                      file=sys.stderr)
        except XeroError as e:
            errors.append({"bill": label, "error": str(e)})

    result = {
        "applied_at": datetime.datetime.utcnow().isoformat() + "Z",
        "dry_run": dry_run,
        "applied": applied,
        "skipped": skipped,
        "errors": errors,
    }
    write_json(os.path.join(out_dir, "applied.json"), result)
    print(f"Applied {len(applied)}, skipped {len(skipped)}, errors {len(errors)} "
          f"-> {out_dir}/applied.json")
    if errors:
        sys.exit(1)


def cmd_report(out_dir):
    result = read_json(os.path.join(out_dir, "applied.json"))
    proposals = read_json(os.path.join(out_dir, "proposals.json"))
    flags = [(b["supplier"], b["invoice_number"], f)
             for b in proposals["bills"] for f in b["flags"]]

    def esc(x):
        return html.escape(str(x if x is not None else ""))

    parts = ["<h2>Draft bills coded " + ("(DRY RUN)" if result.get("dry_run") else "") + "</h2>"]
    if not result["applied"]:
        parts.append("<p>No drafts needed coding this run.</p>")
    for rec in result["applied"]:
        p = rec["proposal"]
        title = p.get("new_invoice_number") or p["invoice_number"]
        parts.append(f"<h3>{esc(p['supplier'])} — {esc(title)} (${esc(p['total'])})</h3>")
        if p.get("new_invoice_number"):
            parts.append(f"<p>Renamed from <i>{esc(p['invoice_number'])}</i></p>")
        parts.append("<table border='1' cellpadding='4'><tr><th>Line</th><th>Qty</th>"
                     "<th>Unit</th><th>Account</th><th>Tracking</th></tr>")
        for l in p["lines"]:
            trk = ", ".join(f"{t['Name']}: {t['Option']}" for t in l["tracking"])
            acct = l["proposed_account"] or l["current_account"] or "?"
            desc = (l["description"] or "").replace("\n", " / ")
            parts.append(f"<tr><td>{esc(desc)}</td><td>{esc(l['quantity'])}</td>"
                         f"<td>{esc(l['unit_amount'])}</td><td><b>{esc(acct)}</b></td>"
                         f"<td>{esc(trk)}</td></tr>")
        parts.append("</table>")
    if result["skipped"]:
        parts.append("<h3>Skipped</h3><ul>")
        parts.extend(f"<li>{esc(s['bill'])}: {esc(s['reason'])}</li>" for s in result["skipped"])
        parts.append("</ul>")
    if result["errors"]:
        parts.append("<h3 style='color:#b00'>Errors</h3><ul>")
        parts.extend(f"<li>{esc(e['bill'])}: {esc(e['error'])}</li>" for e in result["errors"])
        parts.append("</ul>")
    if flags:
        parts.append("<h3>Needs your eye</h3><ul>")
        parts.extend(f"<li><b>{esc(s)} {esc(n)}</b>: {esc(f)}</li>" for s, n, f in flags)
        parts.append("</ul>")
    print("\n".join(parts))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["fetch", "propose", "apply", "report"])
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.command == "fetch":
        cmd_fetch(args.out)
    elif args.command == "propose":
        cmd_propose(args.out)
    elif args.command == "apply":
        cmd_apply(args.out, args.dry_run)
    elif args.command == "report":
        cmd_report(args.out)


if __name__ == "__main__":
    main()
