# Open ERP on your phone (same Wi‑Fi)

## 1. Start services on your PC

```powershell
cd c:\erp
docker compose up -d postgres redis
npm run lan
```

`npm run lan` prints your phone URL, e.g. `http://192.168.1.16:5173/`.

```powershell
# Terminal 1
cd c:\erp\apps\backend
npm run dev

# Terminal 2
cd c:\erp\apps\frontend
npm run dev
```

## 2. On your phone

- Connect to the **same Wi‑Fi** as the PC (not mobile data only).
- Open the **Network** URL from `npm run lan` (port **5173**).

Login works the same as on PC.

## 3. If the phone cannot connect

**Windows Firewall** (run PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "College ERP Frontend" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "College ERP Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

- Confirm PC and phone are on the same subnet.
- Disable VPN on phone/PC if it blocks LAN access.

## Ports

| Port | Service |
|------|---------|
| **5173** | Frontend (use this on phone) |
| **4000** | Backend API (proxied via 5173 in dev; direct only if needed) |

Phone should **not** use port 4000 in dev — use **5173** only.
