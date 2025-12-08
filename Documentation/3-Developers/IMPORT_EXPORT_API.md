# Import/Export API Reference

**AmiExpress-Web Import/Export REST API**
**Version**: 1.0
**Base URL**: `/api/import`
**Authentication**: JWT Bearer Token (Sysop-only)

---

## Table of Contents

1. [Authentication](#authentication)
2. [API Endpoints](#api-endpoints)
3. [Data Types](#data-types)
4. [Error Handling](#error-handling)
5. [Examples](#examples)
6. [Rate Limiting](#rate-limiting)

---

## Authentication

All import/export endpoints require authentication:

```http
Authorization: Bearer <jwt_token>
```

**Requirements:**
- Valid JWT token from `/auth/login`
- User must have sysop privileges (security level 255)
- Token must not be expired

**Obtaining Token:**

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sysop","password":"your_password"}'
```

Response:
```json
{
  "token": "REDACTED",
  "user": { "username": "sysop", "secLevel": 255 }
}
```

---

## API Endpoints

### 1. Upload Archive

Upload a BBS archive file to create an import session.

**Endpoint:** `POST /api/import/upload`

**Content-Type:** `multipart/form-data`

**Request:**
```http
POST /api/import/upload HTTP/1.1
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="archive"; filename="bbs.lha"
Content-Type: application/octet-stream

<binary file data>
------WebKitFormBoundary--
```

**Form Field:**
- `archive` (file, required) - Archive file (LHA, LZX, ZIP, TAR)

**Response:** `200 OK`
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "bbs.lha",
  "size": 5242880
}
```

**Errors:**
- `400` - No file provided or invalid file type
- `413` - File too large (>100MB)
- `401` - Not authenticated
- `403` - Not authorized (not sysop)

---

### 2. Validate Session

Validate uploaded archive and detect conflicts.

**Endpoint:** `POST /api/import/validate/:sessionId`

**Request:**
```http
POST /api/import/validate/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "valid": true,
  "validation": {
    "structure": {
      "valid": true,
      "errors": [],
      "warnings": ["User.keys not found"],
      "info": ["Found 14 conference directories"]
    },
    "users": {
      "valid": true,
      "errors": [],
      "warnings": [],
      "info": ["Validated 45 users"]
    },
    "conferences": {
      "valid": true,
      "errors": [],
      "warnings": [],
      "info": ["Validated 14 conferences"]
    },
    "config": {
      "valid": true,
      "errors": [],
      "warnings": ["SMTP host specified but no port"],
      "info": ["Configuration validation complete"]
    }
  },
  "conflicts": {
    "userConflicts": [
      {
        "id": "user-john",
        "type": "user",
        "field": "username",
        "existing": {
          "username": "john",
          "secLevel": 50,
          "calls": 100
        },
        "import": {
          "username": "john",
          "secLevel": 100,
          "calls": 250
        }
      }
    ],
    "conferenceConflicts": [],
    "commandConflicts": [],
    "recommendations": [
      "1 user conflicts detected. Options: skip, replace, rename, or merge stats."
    ]
  },
  "summary": {
    "users": 45,
    "conferences": 14,
    "commands": 82,
    "nodes": 6
  }
}
```

**Errors:**
- `404` - Session not found
- `500` - Validation failed

---

### 3. Get Session Status

Retrieve current status of an import session.

**Endpoint:** `GET /api/import/session/:sessionId`

**Request:**
```http
GET /api/import/session/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "importing",
    "progress": 75,
    "createdAt": "2025-11-13T10:30:00.000Z",
    "conflicts": [
      /* array of conflicts */
    ],
    "result": null
  }
}
```

**Session Status Values:**
- `pending` - Created, awaiting validation
- `validating` - Currently validating
- `previewing` - Validation complete, awaiting user action
- `resolving` - User resolving conflicts
- `importing` - Import in progress
- `completed` - Import finished successfully
- `failed` - Import failed
- `rolled_back` - Import failed and rolled back

**Errors:**
- `404` - Session not found

---

### 4. List All Sessions

Get list of all import sessions.

**Endpoint:** `GET /api/import/sessions`

**Request:**
```http
GET /api/import/sessions HTTP/1.1
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "progress": 100,
      "createdAt": "2025-11-13T10:30:00.000Z",
      "archivePath": "bbs.lha"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "status": "importing",
      "progress": 45,
      "createdAt": "2025-11-13T11:00:00.000Z",
      "archivePath": "bbs2.zip"
    }
  ]
}
```

---

### 5. Execute Import

Execute import with specified conflict resolution strategies.

**Endpoint:** `POST /api/import/execute/:sessionId`

**Request:**
```http
POST /api/import/execute/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "userConflictStrategy": "skip",
  "conferenceConflictStrategy": "skip",
  "commandConflictStrategy": "skip",
  "createBackup": true,
  "forcePasswordReset": false,
  "importUsers": true,
  "importConferences": true,
  "importCommands": true,
  "importConfig": true,
  "importBulletins": true,
  "importScreens": true
}
```

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userConflictStrategy` | string | No | "skip" | How to handle user conflicts: "skip", "replace", "rename", "merge" |
| `conferenceConflictStrategy` | string | No | "skip" | How to handle conference conflicts: "skip", "replace", "rename", "merge" |
| `commandConflictStrategy` | string | No | "skip" | How to handle command conflicts: "skip", "replace" |
| `createBackup` | boolean | No | true | Create database backup before import |
| `forcePasswordReset` | boolean | No | false | Force users to reset password on first login |
| `importUsers` | boolean | No | true | Import user accounts |
| `importConferences` | boolean | No | true | Import conferences |
| `importCommands` | boolean | No | true | Import commands |
| `importConfig` | boolean | No | true | Import BBS configuration |
| `importBulletins` | boolean | No | true | Import bulletin files |
| `importScreens` | boolean | No | true | Import screen files |

**Response:** `200 OK`
```json
{
  "success": true,
  "result": {
    "usersImported": 45,
    "conferencesImported": 14,
    "commandsImported": 82,
    "errors": [],
    "warnings": [
      "Skipped user: john (already exists)",
      "Conference Main has no file areas"
    ]
  }
}
```

**Errors:**
- `404` - Session not found
- `400` - Invalid options
- `500` - Import failed (database rolled back)

---

### 6. Delete Session

Delete an import session and cleanup temporary files.

**Endpoint:** `DELETE /api/import/session/:sessionId`

**Request:**
```http
DELETE /api/import/session/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Session deleted"
}
```

**Errors:**
- `404` - Session not found
- `500` - Cleanup failed

---

### 7. Cancel Import

Cancel an active import operation.

**Endpoint:** `POST /api/import/cancel/:sessionId`

**Request:**
```http
POST /api/import/cancel/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Import cancelled"
}
```

**Note:** Cancellation may not be immediate. Database will be in consistent state.

---

## Data Types

### ConflictResolutionStrategy

```typescript
type ConflictResolutionStrategy = 'skip' | 'replace' | 'rename' | 'merge';
```

**Values:**
- `skip` - Don't import conflicting items
- `replace` - Replace existing items with imported data
- `rename` - Import with modified name (e.g., "user2")
- `merge` - Merge data intelligently (users: higher stats win)

### ImportConflict

```typescript
interface ImportConflict {
  id: string;
  type: 'user' | 'conference' | 'command' | 'config';
  field: string;
  existing: any;  // Current database data
  import: any;    // Imported data
}
```

### ImportResult

```typescript
interface ImportResult {
  success: boolean;
  usersImported: number;
  conferencesImported: number;
  commandsImported: number;
  errors: string[];
  warnings: string[];
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}
```

---

## Error Handling

### Error Response Format

All errors return JSON with this structure:

```json
{
  "error": "Short error description",
  "message": "Detailed error message",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad Request | Fix request parameters |
| 401 | Unauthorized | Login required |
| 403 | Forbidden | Sysop access required |
| 404 | Not Found | Check session ID |
| 413 | Payload Too Large | Reduce file size |
| 500 | Server Error | Retry or contact admin |

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `NO_FILE` | No archive file provided | Include file in request |
| `INVALID_FORMAT` | Unsupported archive format | Use LHA, LZX, ZIP, or TAR |
| `FILE_TOO_LARGE` | File exceeds 100MB limit | Compress or split archive |
| `SESSION_NOT_FOUND` | Invalid session ID | Create new session |
| `VALIDATION_FAILED` | Archive validation error | Check archive structure |
| `IMPORT_FAILED` | Import execution error | Check logs, database rolled back |

---

## Examples

### Complete Import Workflow (cURL)

```bash
#!/bin/bash

# Configuration
BBS_URL="http://localhost:3001"
TOKEN="your_jwt_token_here"
ARCHIVE_FILE="bbs.lha"

# Step 1: Upload archive
echo "Uploading archive..."
UPLOAD_RESPONSE=$(curl -X POST "$BBS_URL/api/import/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "archive=@$ARCHIVE_FILE")

SESSION_ID=$(echo $UPLOAD_RESPONSE | jq -r '.sessionId')
echo "Session ID: $SESSION_ID"

# Step 2: Validate
echo "Validating archive..."
curl -X POST "$BBS_URL/api/import/validate/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Step 3: Get session status
echo "Checking session..."
curl -X GET "$BBS_URL/api/import/session/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Step 4: Execute import
echo "Executing import..."
curl -X POST "$BBS_URL/api/import/execute/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userConflictStrategy": "skip",
    "conferenceConflictStrategy": "skip",
    "commandConflictStrategy": "skip",
    "createBackup": true
  }' | jq '.'

# Step 5: Check final status
echo "Final status..."
curl -X GET "$BBS_URL/api/import/session/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### JavaScript/TypeScript Example

```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const BBS_URL = 'http://localhost:3001';
const TOKEN = 'your_jwt_token_here';

async function importBBS(archivePath: string) {
  // Upload
  const formData = new FormData();
  formData.append('archive', fs.createReadStream(archivePath));

  const uploadRes = await axios.post(
    `${BBS_URL}/api/import/upload`,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${TOKEN}`,
      },
    }
  );

  const sessionId = uploadRes.data.sessionId;
  console.log('Session ID:', sessionId);

  // Validate
  const validateRes = await axios.post(
    `${BBS_URL}/api/import/validate/${sessionId}`,
    {},
    {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    }
  );

  console.log('Validation:', validateRes.data);

  // Check conflicts
  if (validateRes.data.conflicts.userConflicts.length > 0) {
    console.log('User conflicts detected');
  }

  // Execute
  const executeRes = await axios.post(
    `${BBS_URL}/api/import/execute/${sessionId}`,
    {
      userConflictStrategy: 'merge',
      conferenceConflictStrategy: 'skip',
      commandConflictStrategy: 'skip',
      createBackup: true,
    },
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('Import result:', executeRes.data);

  return executeRes.data;
}

// Usage
importBBS('/path/to/bbs.lha')
  .then(result => console.log('Success:', result))
  .catch(err => console.error('Error:', err));
```

### Python Example

```python
import requests
import time

BBS_URL = "http://localhost:3001"
TOKEN = "your_jwt_token_here"

def import_bbs(archive_path):
    headers = {"Authorization": f"Bearer {TOKEN}"}

    # Upload
    with open(archive_path, 'rb') as f:
        files = {'archive': f}
        upload_res = requests.post(
            f"{BBS_URL}/api/import/upload",
            headers=headers,
            files=files
        )

    session_id = upload_res.json()['sessionId']
    print(f"Session ID: {session_id}")

    # Validate
    validate_res = requests.post(
        f"{BBS_URL}/api/import/validate/{session_id}",
        headers=headers
    )

    print("Validation:", validate_res.json())

    # Execute
    execute_res = requests.post(
        f"{BBS_URL}/api/import/execute/{session_id}",
        headers=headers,
        json={
            "userConflictStrategy": "skip",
            "conferenceConflictStrategy": "skip",
            "createBackup": True
        }
    )

    result = execute_res.json()
    print("Import result:", result)
    return result

# Usage
import_bbs("/path/to/bbs.lha")
```

---

## Rate Limiting

**Current Limits:**
- No rate limiting implemented in v1.0
- Recommended: 1 import per 5 minutes
- Concurrent imports: 1 (sequential processing)

**Future Plans:**
- Rate limiting by IP/user
- Concurrent import support
- Queue system for large archives

---

## Versioning

This API follows semantic versioning:

**Current Version**: 1.0.0

**Compatibility:**
- Breaking changes: Major version increment
- New endpoints: Minor version increment
- Bug fixes: Patch version increment

**Version Header:**
```http
X-API-Version: 1.0.0
```

---

## Support

- **Documentation**: `/Documentation/3-Developers/`
- **User Guide**: `/Documentation/1-Users/IMPORT_USER_GUIDE.md`
- **GitHub Issues**: Report bugs at repository
- **BBS Forums**: Technical discussion in Dev conference

---

**Last Updated**: November 13, 2025
**API Version**: 1.0.0
