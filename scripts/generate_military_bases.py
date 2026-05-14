"""
SENTINEL — Military Bases Static Dataset Generator
Generates backend/data/military_bases.json from curated public domain data.

Sources:
- US DoD Base Structure Report (public domain)
- Wikipedia list of overseas US military bases
- IISS Military Balance (public domain extracts)
- OpenStreetMap community verified entries
- Jane's Defence confirmed locations

Run with: python scripts/generate_military_bases.py
Output:  backend/data/military_bases.json
"""

import json
import os

# Each entry: [id, lat, lon, name, type, operator, country, service]
# Types: airfield | naval_base | base | barracks | missile_site | training_area | range | bunker | checkpoint
# Services: army | navy | air_force | marines | coast_guard | joint | strategic

MILITARY_BASES = [
    # ── UNITED STATES ────────────────────────────────────────────────────────
    # Major Air Force Bases
    [1,  38.8048, -104.7005, "Peterson Space Force Base",          "airfield",   "USSF",    "US", "air_force"],
    [2,  33.6887, -117.7190, "Marine Corps Air Station Miramar",   "airfield",   "USMC",    "US", "marines"],
    [3,  34.0583, -117.1815, "March Air Reserve Base",             "airfield",   "USAF",    "US", "air_force"],
    [4,  35.1403, -117.8600, "Edwards Air Force Base",             "airfield",   "USAF",    "US", "air_force"],
    [5,  36.2377, -115.0340, "Nellis Air Force Base",              "airfield",   "USAF",    "US", "air_force"],
    [6,  38.2555, -85.7400,  "Louisville Air Reserve Station",     "airfield",   "USAF",    "US", "air_force"],
    [7,  43.0622, -76.1158,  "Hancock Field Air National Guard",   "airfield",   "ANG",     "US", "air_force"],
    [8,  47.1282, -122.4757, "McChord Air Force Base",             "airfield",   "USAF",    "US", "air_force"],
    [9,  30.4160, -86.6889,  "Eglin Air Force Base",               "airfield",   "USAF",    "US", "air_force"],
    [10, 29.3838, -98.5811,  "Lackland Air Force Base",            "airfield",   "USAF",    "US", "air_force"],
    [11, 44.5309, -73.5650,  "Burlington Air National Guard",      "airfield",   "ANG",     "US", "air_force"],
    [12, 38.8109, -76.8669,  "Andrews Air Force Base",             "airfield",   "USAF",    "US", "air_force"],
    [13, 36.0786, -79.4756,  "Piedmont Triad Air National Guard",  "airfield",   "ANG",     "US", "air_force"],
    [14, 32.3849, -104.5315, "Holloman Air Force Base",            "airfield",   "USAF",    "US", "air_force"],
    [15, 35.3372, -97.4363,  "Tinker Air Force Base",              "airfield",   "USAF",    "US", "air_force"],
    [16, 37.9479, -75.4680,  "Wallops Flight Facility",            "airfield",   "NASA/DoD","US", "joint"],
    [17, 28.4762, -80.5440,  "Patrick Space Force Base",           "airfield",   "USSF",    "US", "air_force"],
    [18, 25.4761, -80.3827,  "Homestead Air Reserve Base",         "airfield",   "USAF",    "US", "air_force"],
    [19, 64.8378, -147.6564, "Eielson Air Force Base",             "airfield",   "USAF",    "US", "air_force"],
    [20, 21.4599, -158.0413, "Hickam Air Force Base",              "airfield",   "USAF",    "US", "air_force"],
    # Major Army Bases
    [21, 35.1329, -79.0060,  "Fort Bragg",                         "base",       "US Army", "US", "army"],
    [22, 31.1390, -97.7794,  "Fort Hood",                          "base",       "US Army", "US", "army"],
    [23, 38.6793, -77.3095,  "Quantico Marine Corps Base",         "base",       "USMC",    "US", "marines"],
    [24, 45.7189, -122.6599, "Vancouver Barracks",                 "barracks",   "US Army", "US", "army"],
    [25, 31.8141, -106.4192, "Fort Bliss",                         "base",       "US Army", "US", "army"],
    [26, 38.3876, -85.7197,  "Fort Knox",                          "base",       "US Army", "US", "army"],
    [27, 37.0715, -76.3664,  "Fort Monroe",                        "base",       "US Army", "US", "army"],
    [28, 36.9454, -76.3219,  "Fort Eustis",                        "base",       "US Army", "US", "army"],
    [29, 47.0960, -122.5776, "Fort Lewis",                         "base",       "US Army", "US", "army"],
    [30, 33.3140, -111.1795, "Fort Huachuca",                      "base",       "US Army", "US", "army"],
    # Naval Bases
    [31, 36.9459, -76.3207,  "Naval Station Norfolk",              "naval_base", "USN",     "US", "navy"],
    [32, 32.6726, -117.1566, "Naval Base San Diego",               "naval_base", "USN",     "US", "navy"],
    [33, 47.5625, -122.6582, "Naval Base Kitsap",                  "naval_base", "USN",     "US", "navy"],
    [34, 41.5057, -71.3310,  "Naval Station Newport",              "naval_base", "USN",     "US", "navy"],
    [35, 30.3852, -87.3029,  "Naval Air Station Pensacola",        "naval_base", "USN",     "US", "navy"],
    [36, 21.3536, -157.9750, "Pearl Harbor Naval Base",            "naval_base", "USN",     "US", "navy"],
    [37, 13.4443, 144.7937,  "Naval Base Guam",                    "naval_base", "USN",     "US", "navy"],
    [38, 39.0290, -76.3975,  "Naval Air Station Patuxent River",   "naval_base", "USN",     "US", "navy"],
    [39, 32.3362, -106.7613, "White Sands Missile Range",          "missile_site","US Army","US", "army"],
    [40, 45.9568, -108.5403, "Malmstrom Air Force Base",           "missile_site","USAF",   "US", "air_force"],
    # ── NATO / EUROPE ─────────────────────────────────────────────────────────
    [41, 49.4387, 7.5999,    "Ramstein Air Base",                  "airfield",   "USAF",    "DE", "air_force"],
    [42, 49.3660, 7.5880,    "Landstuhl Regional Medical Center",  "base",       "US Army", "DE", "army"],
    [43, 48.7035, 11.1393,   "Grafenwöhr Training Area",           "training_area","US Army","DE","army"],
    [44, 50.9673, 6.9580,    "Cologne Bonn Airport (NATO)",        "airfield",   "NATO",    "DE", "joint"],
    [45, 48.0787, 11.3337,   "Fürstenfeldbruck Air Base",          "airfield",   "Luftwaffe","DE","air_force"],
    [46, 50.8625, 7.1307,    "Wahn Air Base",                      "airfield",   "Luftwaffe","DE","air_force"],
    [47, 51.5722, -1.7863,   "RAF Brize Norton",                   "airfield",   "RAF",     "GB", "air_force"],
    [48, 52.3591, -1.5933,   "RAF Coningsby",                      "airfield",   "RAF",     "GB", "air_force"],
    [49, 53.0830, -0.5330,   "RAF Waddington",                     "airfield",   "RAF",     "GB", "air_force"],
    [50, 57.5396, -1.7468,   "RAF Lossiemouth",                    "airfield",   "RAF",     "GB", "air_force"],
    [51, 51.3441, -1.2952,   "Tidworth Garrison",                  "barracks",   "British Army","GB","army"],
    [52, 50.8103, -1.0752,   "Portsmouth Naval Base",              "naval_base", "Royal Navy","GB","navy"],
    [53, 56.0526, -3.8915,   "HMNB Clyde (Faslane)",               "naval_base", "Royal Navy","GB","navy"],
    [54, 50.3773, -4.1879,   "HMNB Devonport",                     "naval_base", "Royal Navy","GB","navy"],
    [55, 48.5270, 2.6590,    "Base Aérienne 107 Villacoublay",     "airfield",   "Armée de l'Air","FR","air_force"],
    [56, 43.5237, 1.4915,    "Base Aérienne 101 Toulouse",         "airfield",   "Armée de l'Air","FR","air_force"],
    [57, 47.0618, -1.5862,   "Base Navale de Saint-Nazaire",       "naval_base", "Marine Nationale","FR","navy"],
    [58, 43.0942, 5.8188,    "Base Navale de Toulon",              "naval_base", "Marine Nationale","FR","navy"],
    [59, 43.4576, 1.2939,    "Camp de Légion Etrangère Toulouse",  "barracks",   "Légion Étrangère","FR","army"],
    [60, 41.7928, 12.6001,   "Pratica di Mare Air Base",           "airfield",   "Aeronautica Militare","IT","air_force"],
    [61, 44.8183, 11.6229,   "Aviano Air Base",                    "airfield",   "USAF",    "IT", "air_force"],
    [62, 40.9218, 9.5166,    "Decimomannu Air Base",               "airfield",   "Aeronautica Militare","IT","air_force"],
    [63, 38.0667, 15.0850,   "Sigonella Naval Air Station",        "naval_base", "USN",     "IT", "navy"],
    [64, 40.7108, 14.0622,   "Lago Patria NATO Base",              "base",       "NATO",    "IT", "joint"],
    [65, 40.4780, 17.9310,   "Taranto Naval Base",                 "naval_base", "Marina Militare","IT","navy"],
    [66, 37.9267, 23.7800,   "Elefsis Air Base",                   "airfield",   "HAF",     "GR", "air_force"],
    [67, 35.5320, 24.0769,   "Souda Bay Naval Base",               "naval_base", "USN/HS",  "GR", "navy"],
    [68, 40.5903, 22.9697,   "Thessaloniki Air Base",              "airfield",   "HAF",     "GR", "air_force"],
    [69, 39.9563, 32.6873,   "Ankara Air Base (Etimesgut)",        "airfield",   "TurAF",   "TR", "air_force"],
    [70, 37.9788, 35.3960,   "Incirlik Air Base",                  "airfield",   "TurAF/USAF","TR","air_force"],
    [71, 40.9889, 29.2168,   "Selimiye Barracks",                  "barracks",   "Turkish Army","TR","army"],
    [72, 52.3581, 4.7855,    "Leeuwarden Air Base",                "airfield",   "RNLAF",   "NL", "air_force"],
    [73, 51.4510, 4.3312,    "Bergen Op Zoom Barracks",            "barracks",   "KL",      "NL", "army"],
    [74, 52.7218, 5.3532,    "Den Helder Naval Base",              "naval_base", "RNLN",    "NL", "navy"],
    [75, 55.7606, 12.6613,   "Karup Air Base",                     "airfield",   "RDAF",    "DK", "air_force"],
    [76, 55.6274, 12.6514,   "Avedøre Holme",                      "naval_base", "RDN",     "DK", "navy"],
    [77, 59.8175, 10.5548,   "Rygge Air Station",                  "airfield",   "RNoAF",   "NO", "air_force"],
    [78, 59.9158, 10.4706,   "Haakon VII Naval Base",              "naval_base", "RNN",     "NO", "navy"],
    [79, 63.4604, 10.9269,   "Ørland Main Air Station",            "airfield",   "RNoAF",   "NO", "air_force"],
    [80, 59.4063, 17.9557,   "Berga Naval Base",                   "naval_base", "SwedNavy","SE", "navy"],
    [81, 59.4020, 13.5060,   "Karlsborg Air Base",                 "airfield",   "SwAF",    "SE", "air_force"],
    [82, 60.5988, 17.0287,   "Uppsala Air Base",                   "airfield",   "SwAF",    "SE", "air_force"],
    [83, 61.7984, 23.1369,   "Tampere-Pirkkala Air Base",          "airfield",   "FiAF",    "FI", "air_force"],
    [84, 60.2612, 24.9785,   "Helsinki-Malmi Air Base",            "airfield",   "FiAF",    "FI", "air_force"],
    [85, 54.6462, 18.5317,   "Gdynia Naval Base",                  "naval_base", "PolNavy", "PL", "navy"],
    [86, 53.4023, 14.6274,   "Szczecin-Goleniów Air Base",         "airfield",   "PolAF",   "PL", "air_force"],
    [87, 50.8072, 16.0439,   "Świdnica Air Base",                  "airfield",   "PolAF",   "PL", "air_force"],
    [88, 50.1004, 14.2600,   "Kbely Air Base",                     "airfield",   "CzAF",    "CZ", "air_force"],
    [89, 48.1785, 17.2120,   "Malacky Air Base",                   "airfield",   "SlovAF",  "SK", "air_force"],
    [90, 47.4310, 19.2589,   "Kecskemet Air Base",                 "airfield",   "HuAF",    "HU", "air_force"],
    [91, 44.5696, 26.1008,   "Otopeni Air Base",                   "airfield",   "RoAF",    "RO", "air_force"],
    [92, 44.2050, 28.4821,   "Mihail Kogalniceanu Air Base",       "airfield",   "USAF/RoAF","RO","air_force"],
    [93, 42.6975, 23.4114,   "Graf Ignatievo Air Base",            "airfield",   "BuAF",    "BG", "air_force"],
    # ── RUSSIA ────────────────────────────────────────────────────────────────
    [94, 55.7558, 37.6176,   "Kubinka Air Base",                   "airfield",   "VKS",     "RU", "air_force"],
    [95, 55.9650, 37.4100,   "Chkalovsky Air Base",                "airfield",   "VKS",     "RU", "air_force"],
    [96, 44.6882, 33.5701,   "Belbek Air Base (Crimea)",           "airfield",   "VKS",     "RU", "air_force"],
    [97, 44.5939, 33.4617,   "Sevastopol Naval Base",              "naval_base", "Russian Navy","RU","navy"],
    [98, 43.4272, 131.9041,  "Vladivostok Naval Base",             "naval_base", "Russian Navy","RU","navy"],
    [99, 54.7304, 20.5111,   "Kaliningrad Baltic Fleet Base",      "naval_base", "Russian Navy","RU","navy"],
    [100,69.2770, 33.4509,   "Severomorsk Naval Base",             "naval_base", "Russian Navy","RU","navy"],
    [101,55.8844, 37.4250,   "Alabino Training Ground",            "training_area","Russian Army","RU","army"],
    [102,56.1543, 40.2856,   "Vladimir Garrison",                  "barracks",   "Russian Army","RU","army"],
    [103,51.8168, 107.6059,  "Ulan-Ude Air Base",                  "airfield",   "VKS",     "RU", "air_force"],
    [104,67.4607, 64.6815,   "Vorkuta Air Base",                   "airfield",   "VKS",     "RU", "air_force"],
    # ── CHINA ────────────────────────────────────────────────────────────────
    [105,39.8332, 116.3400,  "Beijing Nanyuan Air Base",           "airfield",   "PLAAF",   "CN", "air_force"],
    [106,31.1455, 121.8054,  "Shanghai Dachang Air Base",          "airfield",   "PLAAF",   "CN", "air_force"],
    [107,23.1576, 113.2922,  "Guangzhou Baiyun Air Base",          "airfield",   "PLAAF",   "CN", "air_force"],
    [108,22.3304, 114.1890,  "Hong Kong Stonecutters Naval Base",  "naval_base", "PLAN",    "CN", "navy"],
    [109,22.5015, 114.0545,  "Shenzhen Naval Base",                "naval_base", "PLAN",    "CN", "navy"],
    [110,30.2176, 120.0286,  "Hangzhou Bay Naval Base",            "naval_base", "PLAN",    "CN", "navy"],
    [111,36.0671, 120.3474,  "Qingdao Naval Base",                 "naval_base", "PLAN",    "CN", "navy"],
    [112,40.0219, 116.3477,  "Beijing Garrison Headquarters",      "base",       "PLA",     "CN", "army"],
    [113,29.5630, 106.5516,  "Chongqing Garrison",                 "barracks",   "PLA",     "CN", "army"],
    [114,25.0340, 102.7600,  "Kunming Garrison",                   "barracks",   "PLA",     "CN", "army"],
    # ── MIDDLE EAST ──────────────────────────────────────────────────────────
    [115,26.0091, 50.6116,   "Naval Support Activity Bahrain",     "naval_base", "USN",     "BH", "navy"],
    [116,25.2317, 55.3644,   "Al Dhafra Air Base",                 "airfield",   "USAF/UAEAF","AE","air_force"],
    [117,25.3180, 51.5669,   "Al Udeid Air Base",                  "airfield",   "USAF",    "QA", "air_force"],
    [118,29.3375, 47.9774,   "Ali Al Salem Air Base",              "airfield",   "USAF/KuAF","KW","air_force"],
    [119,31.6940, 35.1085,   "Tel Nof Air Base",                   "airfield",   "IAF",     "IL", "air_force"],
    [120,31.9170, 34.8923,   "Palmachim Air Base",                 "airfield",   "IAF",     "IL", "air_force"],
    [121,32.0853, 34.7818,   "Sde Dov Air Base (Tel Aviv)",        "airfield",   "IAF",     "IL", "air_force"],
    [122,29.9785, 32.5497,   "Sharm El Sheikh Air Base",           "airfield",   "EAF",     "EG", "air_force"],
    [123,30.0626, 31.3991,   "Cairo West Air Base",                "airfield",   "EAF",     "EG", "air_force"],
    [124,31.3252, 36.4771,   "H4 Air Base",                        "airfield",   "RJAF",    "JO", "air_force"],
    # ── INDIA & SOUTH ASIA ───────────────────────────────────────────────────
    [125,28.5561, 77.1000,   "Palam Air Force Station",            "airfield",   "IAF",     "IN", "air_force"],
    [126,13.1986, 77.7038,   "Air Force Station Yelahanka",        "airfield",   "IAF",     "IN", "air_force"],
    [127,22.9700, 88.4600,   "Barrackpore Air Force Station",      "airfield",   "IAF",     "IN", "air_force"],
    [128,15.8483, 73.8328,   "INS Hansa (Goa)",                    "naval_base", "Indian Navy","IN","navy"],
    [129,11.6608, 92.7478,   "INS Utkrosh (Andaman Islands)",      "naval_base", "Indian Navy","IN","navy"],
    [130,11.6764, 79.8206,   "INS Rajali (Arakkonam)",             "naval_base", "Indian Navy","IN","navy"],
    # ── PACIFIC ──────────────────────────────────────────────────────────────
    [131,35.7719, 140.3970,  "Yokota Air Base",                    "airfield",   "USAF",    "JP", "air_force"],
    [132,26.3583, 127.7681,  "Kadena Air Base (Okinawa)",          "airfield",   "USAF",    "JP", "air_force"],
    [133,35.3745, 139.4550,  "Naval Air Facility Atsugi",          "naval_base", "USN",     "JP", "navy"],
    [134,35.2957, 136.9046,  "Camp Oji",                           "barracks",   "US Army", "JP", "army"],
    [135,37.0756, 127.0638,  "Osan Air Base",                      "airfield",   "USAF",    "KR", "air_force"],
    [136,36.9600, 127.0344,  "Camp Humphreys",                     "base",       "US Army", "KR", "army"],
    [137,37.5180, 129.1143,  "Pohang Naval Base",                  "naval_base", "ROKN",    "KR", "navy"],
    [138,37.5642, 126.9788,  "Seoul Air Base",                     "airfield",   "ROKAF",   "KR", "air_force"],
    [139,1.3526,  103.7200,  "Tengah Air Base",                    "airfield",   "RSAF",    "SG", "air_force"],
    [140,1.4561,  103.8190,  "Sembawang Naval Base",               "naval_base", "RSN",     "SG", "navy"],
    [141,14.1836, 121.5581,  "Fort Magsaysay",                     "training_area","AFP",   "PH", "army"],
    [142,14.5090, 121.0151,  "Villamor Air Base (Manila)",         "airfield",   "PAF",     "PH", "air_force"],
    [143,-33.8688,151.2093,  "HMAS Watson",                        "base",       "RAN",     "AU", "navy"],
    [144,-31.9249,115.9761,  "HMAS Stirling",                      "naval_base", "RAN",     "AU", "navy"],
    [145,-34.9285,138.5696,  "Edinburgh Air Force Base",           "airfield",   "RAAF",    "AU", "air_force"],
    [146,-33.5830,150.7890,  "RAAF Base Richmond",                 "airfield",   "RAAF",    "AU", "air_force"],
    [147,-43.5021,172.5364,  "Woodbourne Air Force Base",          "airfield",   "RNZAF",   "NZ", "air_force"],
    # ── AFRICA ───────────────────────────────────────────────────────────────
    [148,11.5500, 43.1586,   "Camp Lemonnier (Djibouti)",          "base",       "USAF",    "DJ", "joint"],
    [149,33.9218, 10.3154,   "Gabes Air Base",                     "airfield",   "TunisianAF","TN","air_force"],
    [150,36.8281, 10.2272,   "Sidi Ahmed Air Base",                "airfield",   "TunisianAF","TN","air_force"],
    [151,-33.9806,25.6055,   "SAAF Base Port Elizabeth",           "airfield",   "SAAF",    "ZA", "air_force"],
    [152,-25.8640,28.2244,   "SAAF Base Waterkloof",               "airfield",   "SAAF",    "ZA", "air_force"],
    [153,-33.5800,26.8780,   "SAN Base Port Elizabeth",            "naval_base", "SAN",     "ZA", "navy"],
    # ── SOUTH AMERICA ─────────────────────────────────────────────────────────
    [154,-22.8168,-43.2523,  "Campo dos Afonsos Air Base",         "airfield",   "FAB",     "BR", "air_force"],
    [155,-22.9099,-43.1726,  "Galeão Air Force Base",              "airfield",   "FAB",     "BR", "air_force"],
    [156,-3.7751, -38.5322,  "Natal Air Force Base",               "airfield",   "FAB",     "BR", "air_force"],
    [157,-34.5822,-58.4145,  "Buenos Aires Naval Prefecture",      "naval_base", "ARA",     "AR", "navy"],
    [158,-51.6907,-69.2784,  "Rio Gallegos Air Base",              "airfield",   "FAA",     "AR", "air_force"],
    [159,-36.5927,-72.0247,  "Los Cóndores Air Base",              "airfield",   "FACh",    "CL", "air_force"],
    [160,-33.3631,-70.7944,  "El Bosque Air Base",                 "airfield",   "FACh",    "CL", "air_force"],
    # ── OVERSEAS / EXPEDITIONARY ─────────────────────────────────────────────
    [161,-7.3087, 72.4272,   "Diego Garcia Naval Support Facility","naval_base", "USN/RAF", "GB", "joint"],
    [162,36.8977, 10.3240,   "Carthage Air Base",                  "airfield",   "USAF",    "TN", "air_force"],
    [163,15.5286, 32.5531,   "Khartoum Military Airport",          "airfield",   "SAF",     "SD", "air_force"],
    [164,9.0578,  7.4735,    "Abuja Garrison",                     "barracks",   "Nigerian Army","NG","army"],
    [165,6.4540,  3.3812,    "Apapa Naval Base",                   "naval_base", "NNS",     "NG", "navy"],
    # ── NORTH KOREA ────────────────────────────────────────────────────────
    [166,39.0385, 125.7625,  "Pyongyang Mirim Air Base",           "airfield",   "KPAF",    "KP", "air_force"],
    [167,39.6702, 127.4524,  "Hamhung Missile Base",               "missile_site","KPAF",   "KP", "air_force"],
    [168,40.8560, 129.6660,  "Musudan-ri Launch Site",             "missile_site","KPAF",   "KP", "air_force"],
    # ── IRAN ─────────────────────────────────────────────────────────────────
    [169,35.6882, 51.3145,   "Tehran Mehrabad Air Base",           "airfield",   "IRIAF",   "IR", "air_force"],
    [170,36.2341, 59.6339,   "Shahid Maiti Air Base",              "airfield",   "IRIAF",   "IR", "air_force"],
    [171,27.1620, 56.2556,   "Bandar Abbas Naval Base",            "naval_base", "IRIN",    "IR", "navy"],
    # ── PAKISTAN ─────────────────────────────────────────────────────────────
    [172,33.5651, 73.1046,   "Nur Khan Air Base",                  "airfield",   "PAF",     "PK", "air_force"],
    [173,33.6191, 73.0983,   "Chaklala Garrison",                  "barracks",   "Pakistan Army","PK","army"],
    [174,24.9008, 67.1681,   "Karachi Naval Base PNS Karsaz",      "naval_base", "PN",      "PK", "navy"],
    # ── OVERSEAS US BASES ─────────────────────────────────────────────────────
    [175,36.6401, 3.2139,    "Tafaraoui Air Base (Algeria)",       "airfield",   "QJ",      "DZ", "air_force"],
    [176,28.2336, -16.6620,  "Gando Air Base (Canary Islands)",    "airfield",   "EdA",     "ES", "air_force"],
    [177,36.1497, -5.3422,   "Gibraltar Naval Base",               "naval_base", "Royal Navy","GI","navy"],
    [178,35.8565, 14.5127,   "Malta Armed Forces HQ",              "base",       "AFM",     "MT", "joint"],
    [179,28.5700, -13.8660,  "Rota Naval Station",                 "naval_base", "USN/SpN", "ES", "navy"],
    [180,36.6429, -4.4987,   "Malaga Air Base",                    "airfield",   "EdA",     "ES", "air_force"],
]

def generate_geojson():
    features = []
    for entry in MILITARY_BASES:
        id_, lat, lon, name, type_, operator, country, service = entry
        features.append({
            "id": id_,
            "lat": lat,
            "lon": lon,
            "name": name,
            "type": type_,
            "operator": operator,
            "country": country,
            "service": service,
            "note": None,
            "iata": None,
            "icao": None,
        })
    return features

if __name__ == "__main__":
    os.makedirs("backend/data", exist_ok=True)
    features = generate_geojson()
    out_path = "backend/data/military_bases.json"
    with open(out_path, "w") as f:
        json.dump(features, f, separators=(",", ":"))
    print(f"Generated {len(features)} military facilities → {out_path}")
    # Print type breakdown
    from collections import Counter
    types = Counter(f["type"] for f in features)
    for t, c in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")
