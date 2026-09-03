/*
 * The smallest door there is, and the phase 0 yardstick.
 *
 * It asks where it is running and writes one line. It does NOT draw a box,
 * which is the point: linked against the whole library, its binary must not
 * carry ae_box.  tools/measure-link.sh builds this and hello_box.c and
 * compares.
 */

#include "ae_host.h"
#include "ae_out.h"

int main(void)
{
    const ae_host_info_t *host = ae_host_info();

    ae_write_line("Hello from a C door.");

    if (host->host == AE_HOST_WEB) {
        ae_write_line("Running on amiexpress-web.");
        if (ae_can(AE_CAP_PETSCII)) {
            /* Still ANSI on the wire - the board converts it. Drawn for 40
               columns because that is what the caller has. */
            ae_write_line("The caller is a C64: drawing for 40 columns.");
        }
        if (ae_can(AE_CAP_WIDE)) {
            ae_write_line("The caller can take more than 80 columns.");
        }
    } else {
        ae_write_line("Classic AmiExpress: 80x25 ANSI, and nothing assumed.");
    }

    return 0;
}
