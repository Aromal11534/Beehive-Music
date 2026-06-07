import httpx
import re
import json

resp = httpx.get('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M')
match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', resp.text)
data = json.loads(match.group(1))
with open('embed_data.json', 'w') as f:
    json.dump(data, f, indent=2)
print("Saved to embed_data.json")
