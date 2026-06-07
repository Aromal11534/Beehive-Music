import httpx
import re

r = httpx.get('https://open.spotify.com', headers={'User-Agent': 'Mozilla/5.0'})
match = re.search(r'clientId":"([^"]+)"', r.text)
if match:
    print(match.group(1))
else:
    print("Not found")
