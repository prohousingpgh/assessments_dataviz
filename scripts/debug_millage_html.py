import re
import urllib.request

html = urllib.request.urlopen(
    "https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025"
).read().decode("utf-8", "replace")

mills = {}
for line in html.split("\n"):
    if "muniprofile.asp" not in line and "munipgh.asp" not in line:
        continue
    name_m = re.search(r">([^<]+)</a>", line)
    val_m = re.search(r"\|\s*([\d.]+)\s*\|?\s*$", line.strip())
    if not val_m:
        parts = line.split("|")
        for p in reversed(parts):
            p = p.strip()
            if re.fullmatch(r"[\d.]+", p):
                val_m = re.match(r"([\d.]+)", p)
                break
    if name_m and val_m:
        mills[name_m.group(1).strip()] = float(val_m.group(1))

print("count", len(mills))
for k in sorted(mills)[:15]:
    print(k, mills[k])
