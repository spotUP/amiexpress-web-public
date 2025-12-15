#include "../../includes/amiexpress.h"

// Simple 68K Amiga door created with Bartman's GCC cross-compiler
// This demonstrates C-based 68K door development for AmiExpress

int main(int argc, char *argv[]) {
    // Test door that sends a message
    sendmessage("Hello from 68K C door!", 1);
    return 0;
}