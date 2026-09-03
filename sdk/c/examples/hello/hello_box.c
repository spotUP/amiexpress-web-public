/*
 * The same door, plus one call to ae_box().
 *
 * The difference between this binary and hello's is what the box widget
 * costs. If hello's own size moves when a module is merely PRESENT in the
 * library, the layering is wrong - see tools/measure-link.sh.
 */

#include "ae_host.h"
#include "ae_out.h"
#include "ae_box.h"

int main(void)
{
    const ae_host_info_t *host = ae_host_info();

    ae_box(40, 5, "HELLO");
    ae_write_line("Hello from a C door.");

    if (host->host == AE_HOST_WEB) {
        ae_write_line("Running on amiexpress-web.");
        if (ae_can(AE_CAP_PETSCII)) {
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
