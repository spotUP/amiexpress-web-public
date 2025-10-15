# AmiExpress Web - Classic BBS Experience in the Modern Web

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yourusername/amiexpress-web)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/amiexpress-web)

AmiExpress Web is a faithful recreation of the classic AmiExpress BBS (Bulletin Board System) software, bringing the authentic 1990s BBS experience to modern web browsers. This project implements the complete AmiExpress v5.6.0 feature set with pixel-perfect accuracy while adding modern web capabilities.

## 🚀 Quick Deploy

Choose your preferred platform:

### **Option 1: Render.com (Recommended for Full Features)**
- ✅ **Persistent database storage**
- ✅ **WebSocket support for real-time features**
- ✅ **File upload/download capabilities**
- ✅ **Background processing**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yourusername/amiexpress-web)

### **Option 2: Vercel (Great for Frontend-Only)**
- ✅ **Global CDN**
- ✅ **Instant deployments**
- ✅ **Analytics integration**
- ⚠️ **Limited WebSocket support** (serverless functions)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/amiexpress-web)

## 📋 Deployment Instructions

### **Vercel Deployment (Main Application)**

#### Prerequisites
- Vercel account
- Vercel CLI installed (`npm i -g vercel`)

#### One-Click Deployment
1. **Click the "Deploy with Vercel" button** above
2. **Connect your GitHub account**
3. **Vercel will automatically configure** the project using `vercel.json`

#### Manual Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Clone and deploy
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Deploy
./deploy-vercel.sh production
```

### **Render.com Deployment (Webhooks Only)**

#### Prerequisites
- Render.com account (free tier available)
- Vercel deployment already configured

#### Webhook Setup
```bash
# Deploy webhook infrastructure to Render
./deploy.sh production --setup-webhooks

# Test webhook functionality
./deploy.sh production --test-webhooks
```

#### Manual Deployment
```bash
# Clone the repository
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Run the deployment script
./deploy.sh production

# Or deploy step-by-step:
# 1. Deploy backend to Render
# 2. Deploy frontend to Render
# 3. Configure environment variables
```

### **Vercel Deployment**

#### Prerequisites
- Vercel account
- Vercel CLI installed (`npm i -g vercel`)

#### One-Click Deployment
1. **Click the "Deploy with Vercel" button** above
2. **Connect your GitHub account**
3. **Vercel will automatically configure** the project using `vercel.json`

#### Manual Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Clone and deploy
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Deploy
./deploy-vercel.sh production
```

### **Environment Variables**

#### Required for Both Platforms
```bash
NODE_ENV=production
JWT_SECRET=your-secret-key-here
```

#### Vercel Specific (Database)
```bash
POSTGRES_URL=your-vercel-postgres-url
POSTGRES_PRISMA_URL=your-vercel-postgres-url
POSTGRES_URL_NO_SSL=your-vercel-postgres-url
POSTGRES_URL_NON_POOLING=your-vercel-postgres-url
POSTGRES_USER=your-db-user
POSTGRES_HOST=your-db-host
POSTGRES_PASSWORD=your-db-password
POSTGRES_DATABASE=your-db-name
```

#### Render.com Specific (Webhooks)
```bash
RENDER_API_KEY=your-render-api-key
```

#### Vercel Specific
```bash
VERCEL=1
VITE_API_URL=https://your-app.vercel.app/api
```

## 🏗️ Architecture

### Backend (Node.js + Express + Socket.io)
- **Framework**: Express.js with TypeScript
- **Real-time**: Socket.io for live BBS sessions
- **Database**: PostgreSQL (Vercel-hosted)
- **Authentication**: JWT tokens
- **File Transfer**: WebSocket-based chunking
- **Health Checks**: Platform monitoring endpoints
- **Migrations**: Automatic database schema updates

### Frontend (React + xterm.js)
- **Terminal**: xterm.js with canvas rendering
- **UI**: React with modern hooks
- **Styling**: CSS with MicroKnight font
- **Build**: Vite for fast development

### Infrastructure Setup

#### **Vercel (Main Application)**
- **Backend**: Serverless functions with automatic scaling
- **Frontend**: Static site with global CDN
- **Database**: PostgreSQL hosted on Vercel
- **WebSocket Support**: Limited (Edge Functions)
- **File Storage**: Vercel Blob or external service
- **Scaling**: Automatic edge scaling
- **Migrations**: Automatic on serverless function startup

#### **Render.com (Webhooks & CI/CD)**
- **Webhook Service**: Simple Express app for CI/CD automation
- **Environment**: Staging/Production webhook endpoints
- **Integration**: Triggers Vercel deployments
- **Monitoring**: Health checks and logging
- **Scaling**: Manual scaling (webhook service)

## 🎯 Key Features

### ✅ Complete BBS Implementation
- **User Management**: Registration, login, security levels
- **Message System**: Public/private messages, threading, QWK/FTN offline mail
- **File Areas**: Upload/download, file maintenance, search
- **Real-time Chat**: Sysop paging, active sessions
- **Door Games**: Web-compatible implementations (SAmiLog, CheckUP)
- **System Administration**: User management, configuration

### ✅ Modern Web Enhancements
- **Real-time Updates**: Socket.io live communication
- **Responsive Design**: Works on desktop and mobile
- **File Transfer**: WebSocket-based resumable uploads
- **Security**: JWT authentication, CORS protection
- **Performance**: CDN delivery, caching, optimization

## 📋 Environment Variables

### Backend
```bash
NODE_ENV=production
PORT=10000
JWT_SECRET=your-secret-key
DATABASE_URL=sqlite:./data/amiexpress.db
CORS_ORIGIN=https://your-frontend.onrender.com
```

### Frontend
```bash
VITE_API_URL=https://your-backend.onrender.com
```

## 🔧 Development

### Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local with your actual values
nano .env.local
```

### Local Development
```bash
# Install dependencies
npm install

# Start development servers
npm run dev        # Frontend on :5173
npm run dev-server # Backend on :3001

# Or use the convenience script
./dev-server.js
```

### Database Migrations
```bash
# Check migration status
cd backend && npm run migrate status

# Run pending migrations
cd backend && npm run migrate migrate

# Rollback migrations
cd backend && npm run migrate rollback 1

# Create new migration
cd backend && npm run migrate:create "add_new_feature"

# Validate migrations
cd backend && npm run migrate validate
```

### Building for Production
```bash
# Build both frontend and backend
npm run build

# Start production servers
npm start
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📚 Documentation

- **[Implementation Guide](docs/amiexpress-docs/IMPLEMENTATION_GUIDE.md)**: Technical architecture and design decisions
- **[Feature Matrix](docs/amiexpress-docs/FEATURE_MATRIX.md)**: Complete feature comparison with AmiExpress v5.6.0
- **[Installation Guide](docs/amiexpress-docs/installation.md)**: Detailed setup instructions
- **[Command Reference](docs/amiexpress-docs/COMMAND_REFERENCE.md)**: All BBS commands and their implementations

## 🎮 Usage

### Connecting to the BBS
1. Open your browser to the deployed frontend URL
2. The terminal interface will load automatically
3. Register a new account or login with existing credentials
4. Use classic BBS commands like `R`, `A`, `F`, `D`, `U`, etc.

### Available Commands
- `R` - Read messages
- `A` - Post message
- `E` - Post private message
- `J` - Join conference
- `F` - File areas
- `D` - Download files
- `U` - Upload files
- `O` - Page sysop for chat
- `G` - Goodbye (logout)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **AmiExpress**: The original BBS software that inspired this project
- **Render.com**: Hosting platform that makes deployment effortless
- **xterm.js**: Terminal emulation that brings the BBS experience to life
- **Socket.io**: Real-time communication framework

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/amiexpress-web/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/amiexpress-web/discussions)
- **Documentation**: [Project Wiki](https://github.com/yourusername/amiexpress-web/wiki)

---

**Experience the nostalgia of classic BBS systems with modern web technology!**

*Built with ❤️ for the retro computing community*