/* ae_out - writing to the caller. */
#ifndef AE_OUT_H
#define AE_OUT_H
#ifdef __cplusplus
extern "C" {
#endif

/** Write text as it is. */
void ae_write(const char *text);
/** Write text and end the line the way a serial caller needs it. */
void ae_write_line(const char *text);

#ifdef __cplusplus
}
#endif
#endif /* AE_OUT_H */
