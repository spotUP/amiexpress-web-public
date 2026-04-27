"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JAMAICA_THEME = void 0;
// C canonical drug order: Acid=0, Cocaine=1, Hashish=2, Heroin=3,
// Ludes=4, MDA=5, Opium=6, PCP=7, Peyote=8, Shrooms=9, Speed=10, Weed=11
// C canonical location order matches DefaultLocation[] in dopewars.c:
// Bronx=0, Ghetto=1, Central Park=2, Manhattan=3,
// Coney Island=4, Brooklyn=5, Queens=6, Staten Island=7
exports.JAMAICA_THEME = {
    title: 'GANJA WARS',
    drugNames: [
        'Sensimilla', // 0  was Acid
        'White Lady', // 1  was Cocaine
        'Kaya', // 2  was Hashish
        'Brown Sugar', // 3  was Heroin
        'Molly', // 4  was Ludes
        'Rum Cream', // 5  was MDA
        "Lamb's Bread", // 6  was Opium
        'Angel Dust', // 7  was PCP
        'Magic Mushroom', // 8  was Peyote
        'Shrooms', // 9  was Shrooms
        'Crack Rock', // 10 was Speed
        'Collie Weed', // 11 was Weed
    ],
    drugCheapStrings: {
        0: "Whole heap a sensie slide down from di Blue Mountains! Prices crash!",
        2: "Rastaman bring in whole barrel a Kaya! Di herb market flood out, bredren!",
        4: "Dem raid di pharmacy - Molly selling fi nutten now!",
        11: "Big shipment reach di Kingston wharf - Collie Weed price drop to di ground!",
    },
    // Police presence values unchanged from C defaults
    locationNames: [
        'Trench Town', // 0  police: 10  (was Bronx)
        'Arnett Gardens', // 1  police: 5   (was Ghetto)
        'Emancipation Park', // 2  police: 15  (was Central Park)
        'New Kingston', // 3  police: 90  (was Manhattan)
        'Ocho Rios', // 4  police: 20  (was Coney Island)
        'Spanish Town', // 5  police: 70  (was Brooklyn)
        'Portmore', // 6  police: 50  (was Queens)
        'Negril', // 7  police: 20  (was Staten Island)
    ],
};
//# sourceMappingURL=jamaica.js.map