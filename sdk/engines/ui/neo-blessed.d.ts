/**
 * Type declarations for neo-blessed
 * neo-blessed is compatible with blessed types
 */

declare module 'neo-blessed' {
  export * from 'blessed';
  import blessed = require('blessed');
  export = blessed;
}
