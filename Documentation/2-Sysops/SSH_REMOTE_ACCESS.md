# SSH Remote Access Guide

## Quick Reference

```bash
ssh spot@213.89.15.130
```

---

## Prerequisites (Do Before Leaving)

### 1. Enable Remote Login on Mac

1. Open **System Preferences** (or System Settings on Ventura+)
2. Go to **Sharing** (or General > Sharing)
3. Enable **Remote Login**
4. Ensure "Allow access for: All users" or add your user

Verify SSH is running:
```bash
sudo systemsetup -getremotelogin
```

### 2. Router Port Forwarding

Access your router at: **http://192.168.0.1**

Add a port forwarding rule:

| Setting | Value |
|---------|-------|
| External Port | 22 (or custom like 2222 for security) |
| Internal IP | 192.168.0.65 |
| Internal Port | 22 |
| Protocol | TCP |

---

## Connection Details

| Item | Value |
|------|-------|
| Username | `spot` |
| Public IP | `213.89.15.130` |
| Local IP | `192.168.0.65` |
| Hostname | `BMS-MAC001` |
| Default Port | 22 |

---

## Connect From Outside

### Standard (port 22)
```bash
ssh spot@213.89.15.130
```

### Custom Port (if you set 2222)
```bash
ssh -p 2222 spot@213.89.15.130
```

### With Key Authentication
```bash
ssh -i ~/.ssh/your_key spot@213.89.15.130
```

---

## Troubleshooting

### Check if SSH is reachable
```bash
nc -zv 213.89.15.130 22
```

### If IP changes (dynamic IP)
Your public IP may change. Options:
1. Set up Dynamic DNS (no-ip.com, duckdns.org)
2. Check IP via: https://ifconfig.me
3. Have someone at home run `curl ifconfig.me`

### Connection refused
- Verify Remote Login is enabled on Mac
- Check router port forwarding
- Ensure firewall allows SSH (port 22)

### Timeout
- Public IP may have changed
- Router may have reset port forwarding
- ISP may block port 22 (try port 2222)

---

## Security Tips

1. Use key-based auth instead of passwords
2. Use a non-standard port (2222, 2022, etc.)
3. Consider fail2ban or similar
4. Disable password auth after setting up keys

---

## Keep Session Alive

Add to `~/.ssh/config` on your client:
```
Host bms-mac
  HostName 213.89.15.130
  User spot
  Port 22
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

Then connect with:
```bash
ssh bms-mac
```
