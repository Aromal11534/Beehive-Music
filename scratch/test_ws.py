import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://localhost:8001/ws/681156128847036488?token=dummy"
    async with websockets.connect(uri) as ws:
        print("Connected")
        await asyncio.sleep(1)
        
        cmd = {"action": "remove", "index": 0}
        print("Sending:", cmd)
        await ws.send(json.dumps(cmd))
        
        print("Waiting for response...")
        resp = await ws.recv()
        print("Received:")
        print(resp)

asyncio.run(test_ws())
