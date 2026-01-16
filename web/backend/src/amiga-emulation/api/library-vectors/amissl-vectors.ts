/**
 * amisslmaster.library and amissl.library function vectors
 *
 * Reference: AmiSSL SDK and dannounce.e disassembly
 * LVO = Library Vector Offset (in bytes from library base)
 *
 * Note: AmiSSL is a third-party library providing OpenSSL functionality.
 * LVO offsets were determined by disassembling dannounce binary and
 * cross-referencing with the dannounce.e source code.
 *
 * Key offset confirmed by source comment: OPENSSL_init_ssl = -$67C8 (line 164)
 */

import { LibraryVector } from "./types";
import { AmiSSLMasterLibrary, AmiSSLLibrary } from "../AmiSSLLibrary";

/**
 * amisslmaster.library vectors
 */
export const AMISSLMASTER_VECTORS: LibraryVector[] = [
  // InitAmiSSLMaster() - Initialize AmiSSL
  // LVO: -30
  {
    offset: -30,
    name: "InitAmiSSLMaster",
    handler: (emu, lib: AmiSSLMasterLibrary) => {
      return lib.initAmiSSLMaster();
    },
  },

  // OpenAmiSSL() - Open AmiSSL library
  // LVO: -36
  {
    offset: -36,
    name: "OpenAmiSSL",
    handler: (emu, lib: AmiSSLMasterLibrary) => {
      return lib.openAmiSSL();
    },
  },

  // CloseAmiSSL() - Close AmiSSL library
  // LVO: -42
  {
    offset: -42,
    name: "CloseAmiSSL",
    handler: (emu, lib: AmiSSLMasterLibrary) => {
      lib.closeAmiSSL();
      return 0;
    },
  },
];

/**
 * amissl.library vectors
 *
 * LVO offsets determined from dannounce disassembly:
 * - hexdump -C Utils/dannounce | grep "4e ae"
 * - Cross-referenced with dannounce.e source code order
 *
 * Source comment confirms: OPENSSL_init_ssl = -$67C8(a6) at line 164
 */
export const AMISSL_VECTORS: LibraryVector[] = [
  // InitAmiSSLA() - Initialize AmiSSL with tags
  // LVO: -30 (first function after standard library vectors)
  {
    offset: -30,
    name: "InitAmiSSLA",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.initAmiSSLA();
    },
  },

  // CleanupAmiSSLA() - Cleanup AmiSSL
  // LVO: -36
  {
    offset: -36,
    name: "CleanupAmiSSLA",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.cleanupAmiSSLA();
      return 0;
    },
  },

  // BIO_s_file() - Get file BIO method
  // LVO: -1710 (-0x6AE) - from disassembly 4e ae f9 52
  {
    offset: -1710,
    name: "BIO_s_file",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.bioSFile();
    },
  },

  // BIO_new() - Create new BIO
  // LVO: -1728 (-0x6C0) - from disassembly 4e ae f9 40
  {
    offset: -1728,
    name: "BIO_new",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.bioNew();
    },
  },

  // BIO_ctrl() - Control BIO
  // LVO: -1782 (-0x6F6) - from disassembly 4e ae f9 0a
  {
    offset: -1782,
    name: "BIO_ctrl",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.bioCtrl();
    },
  },

  // CRYPTO_free() - Free memory allocated by OpenSSL
  // LVO: -3450 (-0xD7A) - from disassembly 4e ae f2 86
  {
    offset: -3450,
    name: "CRYPTO_free",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.cryptoFree();
      return 0;
    },
  },

  // ERR_print_errors() - Print SSL errors
  // LVO: -4056 (-0xFD8) - from disassembly 4e ae f0 28
  {
    offset: -4056,
    name: "ERR_print_errors",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.errPrintErrors();
      return 0;
    },
  },

  // SSL_CTX_new() - Create SSL context
  // LVO: -8208 (-0x2010) - from disassembly 4e ae df f0
  {
    offset: -8208,
    name: "SSL_CTX_new",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslCtxNew();
    },
  },

  // SSL_CTX_free() - Free SSL context
  // LVO: -8214 (-0x2016) - from disassembly 4e ae df ea
  {
    offset: -8214,
    name: "SSL_CTX_free",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.sslCtxFree();
      return 0;
    },
  },

  // SSL_get_current_cipher() - Get current cipher
  // LVO: -8262 (-0x2046) - from disassembly 4e ae df ba
  {
    offset: -8262,
    name: "SSL_get_current_cipher",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslGetCurrentCipher();
    },
  },

  // SSL_set_fd() - Associate socket with SSL
  // LVO: -8358 (-0x20A6) - from disassembly 4e ae df 5a
  {
    offset: -8358,
    name: "SSL_set_fd",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslSetFd();
    },
  },

  // SSL_get_peer_certificate() - Get peer certificate
  // LVO: -8670 (-0x21DE) - from disassembly 4e ae de 22
  {
    offset: -8670,
    name: "SSL_get_peer_certificate",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslGetPeerCertificate();
    },
  },

  // SSL_CTX_set_verify() - Set verify mode
  // LVO: -8700 (-0x21FC) - from disassembly 4e ae de 04
  {
    offset: -8700,
    name: "SSL_CTX_set_verify",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.sslCtxSetVerify();
      return 0;
    },
  },

  // SSL_new() - Create SSL connection
  // LVO: -8784 (-0x2250) - from disassembly 4e ae dd b0
  {
    offset: -8784,
    name: "SSL_new",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslNew();
    },
  },

  // SSL_free() - Free SSL connection
  // LVO: -8820 (-0x2274) - from disassembly 4e ae dd 8c
  {
    offset: -8820,
    name: "SSL_free",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.sslFree();
      return 0;
    },
  },

  // SSL_connect() - Perform TLS handshake
  // LVO: -8832 (-0x2280) - from disassembly 4e ae dd 80
  {
    offset: -8832,
    name: "SSL_connect",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslConnect();
    },
  },

  // SSL_read() - Read data over TLS
  // LVO: -8838 (-0x2286) - from disassembly 4e ae dd 7a
  {
    offset: -8838,
    name: "SSL_read",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslRead();
    },
  },

  // SSL_write() - Write data over TLS
  // LVO: -8850 (-0x2292) - from disassembly 4e ae dd 6e
  {
    offset: -8850,
    name: "SSL_write",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslWrite();
    },
  },

  // SSL_shutdown() - Shut down TLS connection
  // LVO: -8994 (-0x2322) - from disassembly 4e ae dc de
  {
    offset: -8994,
    name: "SSL_shutdown",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslShutdown();
    },
  },

  // SSL_CTX_set_default_verify_paths() - Set default verify paths
  // LVO: -9168 (-0x23D0) - from disassembly 4e ae dc 30
  {
    offset: -9168,
    name: "SSL_CTX_set_default_verify_paths",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.sslCtxSetDefaultVerifyPaths();
    },
  },

  // X509_free() - Free X509 certificate
  // LVO: -10620 (-0x298C) - from disassembly 4e ae d6 84
  {
    offset: -10620,
    name: "X509_free",
    handler: (emu, lib: AmiSSLLibrary) => {
      lib.x509Free();
      return 0;
    },
  },

  // X509_NAME_oneline() - Convert X509_NAME to string
  // LVO: -10980 (-0x2AE4) - from disassembly 4e ae d5 1c
  {
    offset: -10980,
    name: "X509_NAME_oneline",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.x509NameOneline();
    },
  },

  // X509_get_subject_name() - Get certificate subject name
  // LVO: -11058 (-0x2B32) - from disassembly 4e ae d4 ce
  {
    offset: -11058,
    name: "X509_get_subject_name",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.x509GetSubjectName();
    },
  },

  // X509_get_issuer_name() - Get certificate issuer name
  // LVO: -11064 (-0x2B38) - estimated near X509_get_subject_name
  {
    offset: -11064,
    name: "X509_get_issuer_name",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.x509GetIssuerName();
    },
  },

  // TLS_client_method() - Get TLS client method
  // LVO: -26934 (-0x6936) - from disassembly 4e ae 96 ca
  {
    offset: -26934,
    name: "TLS_client_method",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.tlsClientMethod();
    },
  },

  // OPENSSL_init_ssl() - Initialize OpenSSL
  // LVO: -26568 (-0x67C8) - CONFIRMED by source comment at line 164
  {
    offset: -26568,
    name: "OPENSSL_init_ssl",
    handler: (emu, lib: AmiSSLLibrary) => {
      return lib.openSSLInitSSL();
    },
  },
];
