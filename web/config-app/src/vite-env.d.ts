/// <reference types="vite/client" />

// Without this, `import.meta.env` is unknown to TypeScript and App.tsx and
// OperatorChatPage.tsx fail to compile - the two errors that stood between
// this app and a clean typecheck. Vite generates this file for new projects;
// it was missing here.
