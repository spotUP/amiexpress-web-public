/**
 * REACHABILITY: the artist's logo file reaches the screen through the door's
 * real entry point (Door.execute -> door.onStart -> showMenu -> renderMenu ->
 * sessionLogoRows -> blessed -> ctx.output -> socket).
 *
 * The sdk tests prove the reader; only this proves Galaga calls it. The
 * sentinel is a string no part of the figlet logo or the menu contains.
 */
export declare function artist_logo_file_reaches_the_screen_through_door_start(): Promise<void>;
//# sourceMappingURL=logo-slot.test.d.ts.map