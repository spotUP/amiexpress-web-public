import 'zmodem.js/dist/zmodem';

export type ZmodemApi = {
  Sentry: any;
  Header: any;
  Browser: any;
};

export const getZmodem = (): ZmodemApi | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as any).Zmodem ?? null;
};
