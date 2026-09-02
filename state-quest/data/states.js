/* ============================================================
   QUIZ DATA - The answer key
   ============================================================

   This is the only file you change to teach a different
   subject later (world capitals, presidents, whatever). The
   quiz engine reads everything from here plus config.js.

   Each state has:
     name              the full state name (spelling matters)
     abbr              the 2-letter code. This is ALSO the id of
                       that state's shape in the map picture, so
                       don't change it unless you change the map.
     capital           the capital city
     region            a number 1-10, matching "regions" below.
                       To move a state to a different region,
                       change this ONE number.
     capitalAlternates other spellings that also count as correct
                       (for example "St. Paul" for "Saint Paul").
                       Leave the empty brackets [] if there are none.
   ============================================================ */

const QUIZ_DATA = {

  meta: {
    title: "US States & Capitals",
    mapAsset: "assets/map/us-states.svg"
  },

  // The region names shown on the "pick your regions" screen.
  regions: {
    "1":  "New England",
    "2":  "Mid-Atlantic",
    "3":  "South Atlantic",
    "4":  "Deep South",
    "5":  "Appalachia & Ohio Valley",
    "6":  "Great Lakes",
    "7":  "Great Plains",
    "8":  "Southwest",
    "9":  "Mountain West",
    "10": "Pacific"
  },

  items: [

    // --- Region 1: New England ---
    { name: "Maine",          abbr: "ME", capital: "Augusta",     region: 1, capitalAlternates: [] },
    { name: "New Hampshire",  abbr: "NH", capital: "Concord",     region: 1, capitalAlternates: [] },
    { name: "Vermont",        abbr: "VT", capital: "Montpelier",  region: 1, capitalAlternates: [] },
    { name: "Massachusetts",  abbr: "MA", capital: "Boston",      region: 1, capitalAlternates: [] },
    { name: "Rhode Island",   abbr: "RI", capital: "Providence",  region: 1, capitalAlternates: [] },

    // --- Region 2: Mid-Atlantic ---
    { name: "Connecticut",    abbr: "CT", capital: "Hartford",    region: 2, capitalAlternates: [] },
    { name: "New York",       abbr: "NY", capital: "Albany",      region: 2, capitalAlternates: [] },
    { name: "New Jersey",     abbr: "NJ", capital: "Trenton",     region: 2, capitalAlternates: [] },
    { name: "Pennsylvania",   abbr: "PA", capital: "Harrisburg",  region: 2, capitalAlternates: [] },
    { name: "Delaware",       abbr: "DE", capital: "Dover",       region: 2, capitalAlternates: [] },

    // --- Region 3: South Atlantic ---
    { name: "Maryland",       abbr: "MD", capital: "Annapolis",   region: 3, capitalAlternates: [] },
    { name: "Virginia",       abbr: "VA", capital: "Richmond",    region: 3, capitalAlternates: [] },
    { name: "North Carolina", abbr: "NC", capital: "Raleigh",     region: 3, capitalAlternates: [] },
    { name: "South Carolina", abbr: "SC", capital: "Columbia",    region: 3, capitalAlternates: [] },
    { name: "Georgia",        abbr: "GA", capital: "Atlanta",     region: 3, capitalAlternates: [] },

    // --- Region 4: Deep South ---
    { name: "Florida",        abbr: "FL", capital: "Tallahassee", region: 4, capitalAlternates: [] },
    { name: "Alabama",        abbr: "AL", capital: "Montgomery",  region: 4, capitalAlternates: [] },
    { name: "Mississippi",    abbr: "MS", capital: "Jackson",     region: 4, capitalAlternates: [] },
    { name: "Louisiana",      abbr: "LA", capital: "Baton Rouge", region: 4, capitalAlternates: [] },
    { name: "Arkansas",       abbr: "AR", capital: "Little Rock", region: 4, capitalAlternates: [] },

    // --- Region 5: Appalachia & Ohio Valley ---
    { name: "West Virginia",  abbr: "WV", capital: "Charleston",  region: 5, capitalAlternates: [] },
    { name: "Kentucky",       abbr: "KY", capital: "Frankfort",   region: 5, capitalAlternates: [] },
    { name: "Tennessee",      abbr: "TN", capital: "Nashville",   region: 5, capitalAlternates: [] },
    { name: "Ohio",           abbr: "OH", capital: "Columbus",    region: 5, capitalAlternates: [] },
    { name: "Indiana",        abbr: "IN", capital: "Indianapolis", region: 5, capitalAlternates: [] },

    // --- Region 6: Great Lakes ---
    { name: "Michigan",       abbr: "MI", capital: "Lansing",     region: 6, capitalAlternates: [] },
    { name: "Illinois",       abbr: "IL", capital: "Springfield", region: 6, capitalAlternates: [] },
    { name: "Wisconsin",      abbr: "WI", capital: "Madison",     region: 6, capitalAlternates: [] },
    { name: "Minnesota",      abbr: "MN", capital: "Saint Paul",  region: 6, capitalAlternates: ["St. Paul"] },
    { name: "Iowa",           abbr: "IA", capital: "Des Moines",  region: 6, capitalAlternates: [] },

    // --- Region 7: Great Plains ---
    { name: "Missouri",       abbr: "MO", capital: "Jefferson City", region: 7, capitalAlternates: [] },
    { name: "Kansas",         abbr: "KS", capital: "Topeka",      region: 7, capitalAlternates: [] },
    { name: "Nebraska",       abbr: "NE", capital: "Lincoln",     region: 7, capitalAlternates: [] },
    { name: "South Dakota",   abbr: "SD", capital: "Pierre",      region: 7, capitalAlternates: [] },
    { name: "North Dakota",   abbr: "ND", capital: "Bismarck",    region: 7, capitalAlternates: [] },

    // --- Region 8: Southwest ---
    { name: "Texas",          abbr: "TX", capital: "Austin",      region: 8, capitalAlternates: [] },
    { name: "Oklahoma",       abbr: "OK", capital: "Oklahoma City", region: 8, capitalAlternates: [] },
    { name: "New Mexico",     abbr: "NM", capital: "Santa Fe",    region: 8, capitalAlternates: [] },
    { name: "Arizona",        abbr: "AZ", capital: "Phoenix",     region: 8, capitalAlternates: [] },
    { name: "Nevada",         abbr: "NV", capital: "Carson City", region: 8, capitalAlternates: [] },

    // --- Region 9: Mountain West ---
    { name: "Colorado",       abbr: "CO", capital: "Denver",      region: 9, capitalAlternates: [] },
    { name: "Utah",           abbr: "UT", capital: "Salt Lake City", region: 9, capitalAlternates: [] },
    { name: "Wyoming",        abbr: "WY", capital: "Cheyenne",    region: 9, capitalAlternates: [] },
    { name: "Montana",        abbr: "MT", capital: "Helena",      region: 9, capitalAlternates: [] },
    { name: "Idaho",          abbr: "ID", capital: "Boise",       region: 9, capitalAlternates: [] },

    // --- Region 10: Pacific ---
    { name: "Washington",     abbr: "WA", capital: "Olympia",     region: 10, capitalAlternates: [] },
    { name: "Oregon",         abbr: "OR", capital: "Salem",       region: 10, capitalAlternates: [] },
    { name: "California",     abbr: "CA", capital: "Sacramento",  region: 10, capitalAlternates: [] },
    { name: "Alaska",         abbr: "AK", capital: "Juneau",      region: 10, capitalAlternates: [] },
    { name: "Hawaii",         abbr: "HI", capital: "Honolulu",    region: 10, capitalAlternates: [] }

  ]
};
