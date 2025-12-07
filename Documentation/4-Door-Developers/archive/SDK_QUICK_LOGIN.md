# SDK Quick Login Feature

## Overview

The SDK Quick Login feature allows door developers to automatically log into the BBS and run their door command when using the preview system. This eliminates the manual steps of creating an account, logging in, and navigating to the door during development.

## How It Works

When you configure quick login and run `npm run preview`, the preview script:

1. Builds your SDK door
2. Registers it as a BBS command
3. Starts the BBS servers
4. Exports environment variables for quick login
5. Shows instructions to test your door

The BBS frontend can then read the SDK_QUICK_LOGIN, SDK_LOGIN_USER, SDK_LOGIN_PASS, and SDK_DOOR_COMMAND environment variables and perform the auto-login.

## Setup

### Method 1: Configuration File (Recommended)

1. Navigate to the SDK directory:
   ```bash
   cd sdk
   ```

2. Copy the example configuration:
   ```bash
   cp .sdk-preview.env.example .sdk-preview.env
   ```

3. Edit `.sdk-preview.env`:
   ```bash
   SDK_QUICK_LOGIN=true
   SDK_LOGIN_USER=sysop
   SDK_LOGIN_PASS=password
   ```

4. Run preview:
   ```bash
   npm run preview examples/hello-world
   ```

### Method 2: Environment Variables

Set environment variables directly in the command:

```bash
SDK_QUICK_LOGIN=true SDK_LOGIN_USER=sysop SDK_LOGIN_PASS=password npm run preview examples/hello-world
```

## Requirements

- **User must exist**: The username specified in `SDK_LOGIN_USER` must already exist in the BBS database
- **Valid password**: The password must match the user's BBS password
- **First-time setup**: If the user doesn't exist, run preview without quick login first, create the account, then restart with quick login enabled

## Configuration Options

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SDK_QUICK_LOGIN` | Enable quick login feature | `false` | Yes |
| `SDK_LOGIN_USER` | BBS username to login as | `sysop` | Yes |
| `SDK_LOGIN_PASS` | User's password | (empty) | Yes |

**Note**: `SDK_DOOR_COMMAND` is automatically set by the preview script based on the door being previewed.

## Example Workflow

### First Time (Creating Account)

```bash
# Step 1: Preview without quick login
cd sdk
npm run preview examples/hello-world

# Step 2: Open browser to http://localhost:5173
# Step 3: Create account: username="testuser", password="test123"
# Step 4: Test door works
# Step 5: Stop preview (Ctrl+C)
```

### Subsequent Runs (With Quick Login)

```bash
# Step 1: Create .sdk-preview.env
cat > .sdk-preview.env << EOF
SDK_QUICK_LOGIN=true
SDK_LOGIN_USER=testuser
SDK_LOGIN_PASS=test123
EOF

# Step 2: Run preview with quick login
npm run preview examples/hello-world

# Step 3: Open browser to http://localhost:5173
# Quick login automatically:
#  - Logs in as "testuser"
#  - Skips to main menu
#  - Runs /HELLOWORLD command
```

## Security

The `.sdk-preview.env` file is automatically ignored by git (added to `.gitignore`), so your credentials won't be committed to the repository.

**Important**: Only use test credentials for quick login. Never use real production passwords.

## Troubleshooting

### Quick Login Not Working

**Problem**: Quick login doesn't activate
**Solution**: Check that:
- `.sdk-preview.env` exists in the `sdk/` directory
- `SDK_QUICK_LOGIN=true` is set
- User credentials are correct
- The user exists in the BBS database

### User Doesn't Exist

**Problem**: "Invalid username or password" error
**Solution**:
1. Disable quick login (set `SDK_QUICK_LOGIN=false`)
2. Run preview and create the account manually
3. Re-enable quick login and try again

### Wrong Password

**Problem**: Quick login fails with authentication error
**Solution**:
1. Verify the password in `.sdk-preview.env` matches the BBS account
2. Reset password by manually logging into BBS
3. Update `.sdk-preview.env` with correct password

## Implementation Details

### Preview Script

The `sdk/tools/preview/start-preview.sh` script:

1. Loads `.sdk-preview.env` if it exists
2. Exports environment variables: `SDK_QUICK_LOGIN`, `SDK_LOGIN_USER`, `SDK_LOGIN_PASS`, `SDK_DOOR_COMMAND`
3. Starts BBS servers with these variables in the environment
4. Shows instructions based on quick login status

### BBS Frontend (Future Implementation)

The BBS frontend will need to:

1. Check for `SDK_QUICK_LOGIN=true` environment variable
2. Automatically submit login form with `SDK_LOGIN_USER` and `SDK_LOGIN_PASS`
3. Navigate to main menu after successful login
4. Execute `SDK_DOOR_COMMAND` automatically

**Note**: The frontend implementation is pending. Currently, the environment variables are set by the preview script, but the frontend auto-login logic needs to be implemented.

## Advanced Usage

### Multiple Test Users

You can create multiple configuration files for different test scenarios:

```bash
# Create configs for different users
cat > .sdk-preview-sysop.env << EOF
SDK_QUICK_LOGIN=true
SDK_LOGIN_USER=sysop
SDK_LOGIN_PASS=admin123
EOF

cat > .sdk-preview-user.env << EOF
SDK_QUICK_LOGIN=true
SDK_LOGIN_USER=testuser
SDK_LOGIN_PASS=test123
EOF

# Use specific config
cp .sdk-preview-sysop.env .sdk-preview.env
npm run preview examples/hello-world

# Or use environment variables directly
SDK_QUICK_LOGIN=true SDK_LOGIN_USER=sysop SDK_LOGIN_PASS=admin123 npm run preview examples/hello-world
```

### Testing Different Security Levels

```bash
# Test as sysop (security level 255)
SDK_QUICK_LOGIN=true SDK_LOGIN_USER=sysop npm run preview examples/admin-tool

# Test as regular user (security level 10)
SDK_QUICK_LOGIN=true SDK_LOGIN_USER=normaluser npm run preview examples/user-game
```

## Files

- `/sdk/.sdk-preview.env.example` - Example configuration file
- `/sdk/.sdk-preview.env` - Your configuration (gitignored)
- `/sdk/tools/preview/start-preview.sh` - Preview script with quick login support
- `/.gitignore` - Contains `.sdk-preview.env` entry

## Future Enhancements

Potential improvements to quick login:

1. **Auto-account creation** - Create test accounts automatically if they don't exist
2. **Remember last user** - Cache last test user for convenience
3. **Security level override** - Set user security level via environment variable
4. **Door parameters** - Pass command-line arguments to door
5. **State persistence** - Preserve door state between preview runs
6. **Multi-node testing** - Test doors with multiple concurrent users

## Related Documentation

- [Door Development Guide](DOOR_DEVELOPMENT.md)
- [SDK Preview System](../6-Progress/SDK_PREVIEW_SIMPLIFICATION_20251111.md)
- [Testing Guide](../3-Developers/TESTING.md)
