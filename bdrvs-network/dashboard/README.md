# B-DRVS Admin Dashboard — Tier 3

Real-time regulator console for the Blockchain-Based Data Residency Verification
System. Built with Vite + React, Leaflet for the compliance map, Chart.js for
trend visualisations, and jsPDF for tamper-evidence report export.

This is **Tier 3** of the three-tier architecture described in Chapter 3 of the
project report. It consumes the REST gateway (Tier 2) which in turn reads from
the Hyperledger Fabric ledger (Tier 1 chaincode).

---

## What you get

- **Overview page** — Ghana-centred Leaflet compliance map, summary statistics,
  monitored-server grid, and a recent-violations panel.
- **Server detail page** — RTT trend line with the residency threshold overlay,
  hourly compliance timeline, full audit-trail table, and a one-click PDF
  evidence export suitable for DPC investigations.
- **Violations page** — every `SOVEREIGNTY_VIOLATION` record on the ledger.
- **Register page** — registers a new health server and its ECDSA public key
  with the residency chaincode via `POST /api/register`.
- **Live gateway status dot** in the header (polls `/api/health`).

The interface uses IBM Plex (Serif/Sans/Mono), Ghana flag colours as
semantic status accents, hairline rules, and an editorial layout intended
for institutional users.

---

## Setup

```bash
cd /home/nii/B-DRVS/bdrvs-network/dashboard

# Install dependencies (Node.js 20 LTS recommended)
npm install

# Copy the environment template
cp .env.example .env.local

# Start the development server
npm run dev
```

The dashboard runs at <http://localhost:5173>. Vite proxies `/api/*` to the
gateway on `http://localhost:3000` so CORS is never an issue in development
(see `vite.config.js`).

### Pre-flight checklist

Before opening the dashboard:

```bash
# Make sure the Fabric network is up
cd /home/nii/B-DRVS/bdrvs-network
docker compose -f compose/docker-compose.yaml up -d

# Make sure the gateway is running
cd gateway
node server.js
```

Then visit the dashboard at <http://localhost:5173>.

### Production build

```bash
npm run build
npm run preview          # quick local serve of the build
```

The static bundle lands in `dist/` and can be served by any static host or
reverse-proxied behind nginx alongside the gateway.

---

## Optional gateway patch — `GET /api/servers`

The dashboard works without this endpoint by deriving the server list from
the violations endpoint plus locally remembered registrations. However, to
make the overview accurate from a fresh install (no localStorage, no
violations yet), add a `GET /api/servers` route to the gateway. Paste the
following into `gateway/routes.js`:

```javascript
// List all registered servers
router.get('/servers', async (req, res) => {
  try {
    const result = await fabric.evaluateTransaction('GetAllServers');
    const parsed = result ? JSON.parse(result.toString()) : [];
    res.json({ servers: parsed });
  } catch (err) {
    logger.error('GetAllServers failed', err);
    res.status(500).json({ error: err.message });
  }
});
```

And the matching chaincode function in `chaincode/residency/residency.go`:

```go
// GetAllServers returns every registered server record on the ledger.
func (s *SmartContract) GetAllServers(ctx contractapi.TransactionContextInterface) ([]*Server, error) {
    iter, err := ctx.GetStub().GetStateByRange("SERVER_", "SERVER_~")
    if err != nil {
        return nil, fmt.Errorf("range query failed: %w", err)
    }
    defer iter.Close()

    var out []*Server
    for iter.HasNext() {
        kv, err := iter.Next()
        if err != nil {
            return nil, err
        }
        var srv Server
        if err := json.Unmarshal(kv.Value, &srv); err != nil {
            continue // skip non-server keys
        }
        out = append(out, &srv)
    }
    return out, nil
}
```

(Adjust the key prefix `SERVER_` to whatever convention you've already
adopted in the chaincode.)

---

## Where the dashboard expects data to come from

The dashboard treats the gateway as the source of truth and tolerates
varying response shapes. If your gateway already returns slightly different
JSON, edit `src/api/client.js` (one well-isolated file) — every component
talks to the gateway through that module only.

Endpoint expectations:

| Endpoint              | Used for                                                |
| --------------------- | ------------------------------------------------------- |
| `GET  /api/health`    | Green/red gateway status dot in the header              |
| `GET  /api/config`    | Surfaces RTT threshold and Ghana IP whitelist           |
| `GET  /api/servers`   | (Optional) Authoritative server list                    |
| `GET  /api/violations`| Recent-violations panel and `/violations` page          |
| `GET  /api/status/:id`| Latest compliance state per server                      |
| `GET  /api/history/:id`| Audit trail + charts on the detail page                |
| `GET  /api/stats/:id` | Compliance summary block                                |
| `POST /api/register`  | Server registration form                                |

---

## Customisation knobs

- **Polling interval** — `VITE_POLL_INTERVAL_MS` in `.env.local`
- **Gateway origin** — `VITE_API_BASE_URL` (set to a full URL for production)
- **Deployment label** — `VITE_DEPLOYMENT_LABEL` is shown next to the
  gateway status dot
- **RTT threshold rendering** — comes from `/api/config`; the chart
  overlay updates automatically
- **Map tiles** — OpenStreetMap by default (no API key); swap the tile URL
  in `src/components/ComplianceMap.jsx` for any TMS layer
