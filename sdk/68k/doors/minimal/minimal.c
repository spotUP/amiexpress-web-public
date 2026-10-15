/*
 * Minimal C Door Test
 */

#include "../../includes/amiexpress.h"

int main(int argc, char *argv[]) {
    Register(1);
    sendmessage("Hello from minimal C door!\r\n", 1);
    ShutDown();
    return 0;
}