#ifndef CONFIG_H
#define CONFIG_H

typedef struct {
    char host[64];
    int port;
    char path[128];
    char download_dir[128];
    int page_size;
    int timeout_secs;
    char lha_command[128];
    int extract_after_download;
    char log_file[128];
} dr_config;

void config_defaults(dr_config *cfg);
int config_load(dr_config *cfg, const char *path, int *skipped_lines);

#endif
