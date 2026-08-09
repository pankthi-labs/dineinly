#!/usr/bin/env python3
"""Regenerates the Arbor Brewing Company fixture block appended to seed.sql.

Standalone maintenance utility (stdlib only, not part of the app build) —
253 menu items transcribed from supabase/menu-1.md/menu-2.md/menu-3.md plus a full
rush-hour operational scenario are impractical to hand-edit directly in SQL.
Edit the data below (or the menu source), then:

    cd supabase && python3 gen-arbor-seed.py && \\
        python3 -c "print(open('arbor_seed_block.sql').read())" \\
        # replace the '-- Arbor Brewing Company' block in seed.sql with it

Deterministic (fixed RNG seed) — rerun always produces the same output, so
diffs only show real content changes. See docs/arbor-seed-notes.md for what
the resulting fixture contains and why.
"""
import random

random.seed(4200)

REST_ID = "10000000-0000-4000-8000-000000000002"

def nid(prefix, n):
    return f"{prefix}-0000-4000-8000-{n:012x}"

def esc(s):
    return s.replace("'", "''")

# ---------------------------------------------------------------------------
# Categories: key -> (name, tax_rate, sort)
# ---------------------------------------------------------------------------
CATS = [
    ("favourites", "Favourites", "0.0500"),
    ("bar_snacks", "Bar Snacks", "0.0500"),
    ("large_plates", "Large Plates", "0.0500"),
    ("pizzas", "Pizzas", "0.0500"),
    ("desserts", "Desserts", "0.0500"),
    ("salads", "Salads", "0.0500"),
    ("tacos", "Tacos", "0.0500"),
    ("small_plates", "Small Plates", "0.0500"),
    ("wings", "Wings", "0.0500"),
    ("burgers", "Burgers", "0.0500"),
    ("beers_on_tap", "Beers on Tap", "0.1800"),
    ("beer_cans", "Beer Cans", "0.1800"),
    ("cocktails", "Classic Cocktails", "0.1800"),
    ("sangria_wine", "Sangria & Wine", "0.1800"),
    ("sparkling", "Sparkling Wine & Champagne", "0.1800"),
    ("mocktails", "Mocktails & Kombucha", "0.1800"),
    ("spirits", "Spirits & Liquors", "0.1800"),
    ("whisky_bourbon", "Whisky & Bourbon", "0.1800"),
    ("non_alc", "Non-Alcoholic Beverages", "0.1800"),
]
CAT_ID = {key: nid("30000000", i + 3) for i, (key, _, _) in enumerate(CATS)}  # existing seed uses 1,2

LABELS = ["chef special", "spicy", "bestseller", "new"]
LABEL_ID = {name: nid("35000000", i + 4) for i, name in enumerate(LABELS)}  # existing seed uses 1,2,3

SPICE_KEYWORDS = [
    "chilli", "spicy", "buffalo", "harissa", "naga", "jerk", "piri piri", "arrabiata",
    "manchurian", "curry", "cajun", "sriracha", "peri", "kimchi", "gochujang",
]
ICE_DEFAULT_TRUE_HINTS = ["iced", "cooler", "soda", "kombucha", "mocktail"]

items = []  # dicts

def add_item(cat, name, desc, price, prep, serving, diet, *, labels=None,
             availability="available", status="active",
             offers_spice=None, offers_salt=False, offers_ice=None):
    labels = labels or []
    text = f"{name} {desc}".lower()
    if offers_spice is None:
        offers_spice = any(k in text for k in SPICE_KEYWORDS)
    if offers_ice is None:
        offers_ice = any(k in text for k in ICE_DEFAULT_TRUE_HINTS)
    items.append(dict(
        cat=cat, name=name, desc=desc, price=price, prep=prep, serving=serving,
        diet=diet, labels=labels, availability=availability, status=status,
        offers_spice=offers_spice, offers_salt=offers_salt, offers_ice=offers_ice,
    ))

def food(cat, name, desc, price, prep="15-20 mins", serving="serves 1", diet="non_veg", **kw):
    add_item(cat, name, desc, price, prep, serving, diet, **kw)

def bev(cat, name, desc, price, prep="5-10 mins", serving="serves 1", **kw):
    add_item(cat, name, desc, price, prep, serving, "veg", **kw)

# ---------------------------------------------------------------------------
# FOOD — Favourites
# ---------------------------------------------------------------------------
food("favourites", "Arbor Loaded Nachos",
     "Crunchy corn tortilla chips generously covered with melted cheese, refried beans, shredded lettuce, "
     "pico de gallo, sour cream, and guacamole (Gluten Free). Add-ons: grilled chicken +100, grilled tenderloin +125.",
     420.00, "15-20 mins", "serves 2", "veg", labels=["gluten free", "bestseller"])
food("favourites", "Chilli Cheese Bacon Fries",
     "Crispy golden French fries smothered in cheese and topped with flavorful beef chilli, crunchy bacon "
     "crumbles, and a dollop of cool sour cream. Seasoned with zesty Cajun spices.",
     550.00, "15-20 mins", "serves 2", "non_veg", labels=["bestseller"])
food("favourites", "Sweet Potato Fries",
     "Perfectly seasoned and cooked to crispy perfection. Served alongside Chipotle mayo. (Gluten Free)",
     260.00, "10-15 mins", "serves 1-2", "veg", labels=["gluten free"])
food("favourites", "Flaming Chicken",
     "Grilled chicken marinated in a fiery chilli sauce infused with tangy citrus peel, zesty lemon, fresh "
     "garlic, bold pepper. Served with magic mustard sauce. (Gluten Free)",
     370.00, "15-20 mins", "serves 1", "non_veg", labels=["gluten free", "spicy"])
food("favourites", "Hummus Plate",
     "Homemade whole wheat pita bread served with creamy hummus, accompanied by a refreshing olive oil, "
     "paprika, sundried tomato.",
     250.00, "5-10 mins", "serves 1-2", "veg", labels=["vegan"])
food("favourites", "Pretzels",
     "Mouth-watering soft pretzels, served with a side of Stout mustard sauce and cheese sauce.",
     250.00, "10-15 mins", "serves 1-2", "veg")
food("favourites", "Beer Battered Onion Rings",
     "Crispy and golden, accompanied by a creamy ranch dip and tangy marinara.",
     260.00, "10-15 mins", "serves 1-2", "veg")
food("favourites", "Pub Style Fish N' Chips",
     "Beer battered fish fried to crispy perfection, served alongside a generous portion of french fries "
     "and tartar sauce.",
     350.00, "15-20 mins", "serves 1", "non_veg", labels=["bestseller"])
food("favourites", "Heavenly Drumsticks",
     "Crispy fried chicken drumsticks prepared in oriental-style and coated in a zesty garlic hot sauce.",
     325.00, "15-20 mins", "serves 1-2", "non_veg", labels=["spicy"])
food("favourites", "Vegan BBQ Harissa Mushroom Slider",
     "Tender oyster mushrooms, zesty harissa paste, and flavorful garlic, all served on a perfectly toasted "
     "slider bun.",
     325.00, "15-20 mins", "serves 1-2", "veg", labels=["vegan", "new", "spicy"])
food("favourites", "Spicy Fried Calamari",
     "Calamari rings coated in a deliciously zesty Bayou breading and fried to a perfect crisp. Served with "
     "our signature marinara sauce and tartar sauce.",
     370.00, "15-20 mins", "serves 1-2", "non_veg", labels=["spicy"])
food("favourites", "Smoked Chicken Quesadilla",
     "Perfect blend of smoky chicken and creamy guacamole, topped off with a sprinkle of tangy Pico de Gallo "
     "and melted cheese.",
     425.00, "15-20 mins", "serves 1-2", "non_veg")
food("favourites", "Pulled Pork Slider",
     "Tender slow-cooked pork smothered in our house-made BBQ sauce, nestled between fluffy sesame buns and "
     "topped with our signature homemade pickle.",
     380.00, "15-20 mins", "serves 1-2", "non_veg")
food("favourites", "Sticky Pork Belly",
     "Pork belly glazed with lemongrass, soy sauce, ginger, and brown sugar, infused with aromatic cinnamon. "
     "(Gluten Free)",
     600.00, "20-30 mins", "serves 1-2", "non_veg", labels=["gluten free", "chef special"])
food("favourites", "Chimichurri Prawns",
     "Prawns dressed in a zesty blend of chimichurri sauce, smoked paprika, garlic, lime juice, and olive "
     "oil. (Gluten Free)",
     525.00, "15-20 mins", "serves 1-2", "non_veg", labels=["gluten free"])
food("favourites", "Twice Baked Potato Skins",
     "Crispy potato shells stuffed with spinach and artichoke, baked with Jack and Colby cheese. (Gluten Free)",
     280.00, "15-20 mins", "serves 1-2", "veg", labels=["gluten free"])
food("favourites", "Jerk Spiced Grilled Cottage Cheese Skewers",
     "Jerk-spiced cottage cheese skewers grilled with jerk spice, bell pepper, onion and broccoli. "
     "(Gluten Free)",
     425.00, "15-20 mins", "serves 1-2", "veg", labels=["gluten free", "new", "spicy"])

# Bar Snacks
food("bar_snacks", "Healthy Bites",
     "Fresh cucumber, carrot, and radish slices served with a side of creamy tzatziki sauce. (Gluten Free)",
     150.00, "5-10 mins", "serves 1-2", "veg", labels=["gluten free"])
food("bar_snacks", "Masala Peanuts",
     "A local favourite! Crunchy treats made with a mouth-watering blend of onions, tomatoes, lime, mint, "
     "peanuts, and green chillies. (Gluten Free)",
     150.00, "5-10 mins", "serves 1-2", "veg", labels=["vegan", "gluten free", "spicy"])
food("bar_snacks", "Spiced Marinated Olives",
     "Olives marinated with garlic, red wine vinegar, and olive oil. Enhanced with a zesty burst of orange, "
     "a spicy kick of chilli flakes, and a sprinkle of fresh parsley. (Gluten Free)",
     180.00, "5-10 mins", "serves 1-2", "veg", labels=["vegan", "gluten free"])

# Large Plates
food("large_plates", "Grilled Chicken",
     "Jerked spice marinated chicken leg with a side of mash potato, grilled vegetables and served with "
     "mushroom red wine jus.",
     380.00, "20-30 mins", "serves 1", "non_veg")
food("large_plates", "Mediterranean Bowl",
     "Falafel, hummus, quinoa tabbouleh, green olives, pickled red onion, and tahini sauce, all served with "
     "warm pita bread.",
     530.00, "20-30 mins", "serves 1", "veg", labels=["vegan"])
food("large_plates", "Fiery Chicken Alfredo",
     "Creamy alfredo sauce infused with a zesty red chilli paste, perfectly complemented by Cajun-seasoned "
     "chicken strips.",
     430.00, "20-30 mins", "serves 1", "non_veg", labels=["spicy"])
food("large_plates", "Spaghetti Arrabiata",
     "Spaghetti coated in a zesty and fiery arrabbiata sauce. Add-ons: cajun chicken +100, grilled "
     "tenderloin +125, grilled prawns +150.",
     280.00, "15-20 mins", "serves 1", "veg", labels=["spicy"])
food("large_plates", "Baked Mac & Cheese",
     "Macaroni coated in a luscious blend of cheddar, parmesan, and mozzarella cheese. Add-ons: crispy "
     "bacon +125, cajun chicken +100, grilled tenderloin +125, grilled prawns +150.",
     320.00, "20-30 mins", "serves 1", "veg", labels=["bestseller"])
food("large_plates", "Aglio E Olio",
     "Spaghetti noodles tossed with black olives, mushrooms and onions in a light but flavorful garlic, "
     "green chilli and olive oil sauce, dusted with parmesan cheese. Add-ons: crispy bacon +125, cajun "
     "chicken +100, grilled tenderloin +125, grilled prawns +150.",
     320.00, "15-20 mins", "serves 1", "veg")
food("large_plates", "Grilled Red Snapper",
     "Tender fillets of red snapper grilled to perfection in a delectable blend of garlic butter, fresh "
     "parsley, and zesty paprika spices. (Gluten Free)",
     650.00, "20-30 mins", "serves 1", "non_veg", labels=["gluten free", "chef special"])
food("large_plates", "Steak Tenderloin with Pink Peppercorns",
     "Succulent Tenderloin Steak with a savoury red wine pepper sauce, adorned with delectable mushrooms "
     "and aromatic pink peppercorns. Served alongside mashed potatoes and grilled vegetables. (Gluten Free)",
     680.00, "30-45 mins", "serves 1", "non_veg", labels=["gluten free", "chef special"])
food("large_plates", "Vegetable Thai Curry",
     "Rich and creamy red curry sauce, mixed vegetables, served over steamed rice with crispy wafers on "
     "the side. (Gluten Free) Add-ons: chicken +100, prawns +150.",
     360.00, "20-30 mins", "serves 1", "veg", labels=["gluten free", "vegan", "spicy"])
food("large_plates", "Grilled Salmon",
     "Fillet of salmon grilled with lemon, parsley, and capers. Served on a bed of asparagus and "
     "accompanied with sweet potatoes. (Gluten Free)",
     900.00, "20-30 mins", "serves 1", "non_veg", labels=["gluten free", "chef special", "bestseller"])

# Pizzas
food("pizzas", "Margherita",
     "Homemade thin-crust pizza, generously coated with our pizza sauce made from our secret recipe, and "
     "adorned with a generous layer of shredded mozzarella cheese and fresh basil.",
     480.00, "20-30 mins", "serves 2", "veg", labels=["bestseller"])
food("pizzas", "Peri-Peri Paneer",
     "Spicy paneer pizza with bell peppers, jalapenos, cherry tomatoes, and gooey mozzarella cheese, "
     "topped with pesto sauce.",
     480.00, "20-30 mins", "serves 2", "veg", labels=["spicy"])
food("pizzas", "Chicken Club Pizza",
     "Succulent cuts of white chicken breast paired with creamy mozzarella, Virginia ham, crispy "
     "smokehouse bacon, and just a touch of tangy tomato.",
     550.00, "20-30 mins", "serves 2", "non_veg")
food("pizzas", "Greek Passion",
     "Tangy feta cheese, roasted red peppers, crispy garlic, fresh spinach, and roasted sesame seeds.",
     480.00, "20-30 mins", "serves 2", "veg")
food("pizzas", "Garden",
     "Flavoursome spiced tomato sauce with a medley of roasted squash, flavorful peppers, tender "
     "artichokes, and sun-dried tomatoes.",
     500.00, "20-30 mins", "serves 2", "veg", labels=["vegan"])
food("pizzas", "Buffalo Soldier",
     "Juicy chicken chunks coated in our signature spicy buffalo sauce, paired with tangy red onions and "
     "a savoury blend of grated mozzarella and cheddar.",
     550.00, "20-30 mins", "serves 2", "non_veg", labels=["spicy"])
food("pizzas", "I Like To Party",
     "Fully-loaded pizza topped with a savoury combination of pepperoni, ham, bacon, sausage, and "
     "ooey-gooey cheese.",
     550.00, "20-30 mins", "serves 2", "non_veg", labels=["bestseller"])
food("pizzas", "Pepperoni Pizza",
     "Tangy tomato sauce infused with spices, topped with pork pepperoni and generous layers of "
     "mozzarella cheese.",
     550.00, "20-30 mins", "serves 2", "non_veg")

# Desserts
food("desserts", "Long Lasting Vertigo",
     "Three layers of rich chocolate sponge cake oozing with smooth and creamy chocolate mousse.",
     260.00, "10-15 mins", "serves 1", "veg", labels=["bestseller"])
food("desserts", "Tiramisu",
     "Rich layer cake soaked in a blend of coffee, rum, and Kahlua, and generously filled with cream cheese.",
     260.00, "10-15 mins", "serves 1", "veg")
food("desserts", "Banoffee Pie",
     "Buttery biscuit crust, creamy toffee filling, and slices of fresh banana. (Eggless)",
     240.00, "10-15 mins", "serves 1", "veg", labels=["eggless"])
food("desserts", "Caramel Drizzled Brownie",
     "Decadent chocolate brownie, generously drizzled with gooey caramel sauce, served alongside a scoop "
     "of creamy vanilla ice cream.",
     350.00, "10-15 mins", "serves 1", "veg")
food("desserts", "Lemon Meringue Pie",
     "Buttery biscuit base topped with a luscious layer of creamy lemon curd, finished with a fluffy, "
     "golden-brown meringue.",
     260.00, "10-15 mins", "serves 1", "veg")

# Salads
food("salads", "Caesar Salad",
     "Fresh, crispy lettuce and croutons, tossed together with a timeless anchovy and Parmesan Caesar "
     "dressing. Add-ons: grilled chicken +100, grilled tenderloin +125, grilled prawns +150.",
     220.00, "10-15 mins", "serves 1", "non_veg")
food("salads", "Mediterranean Salad",
     "Boutique garden greens paired with feta cheese, black olives, red onion, sun-dried tomatoes, "
     "artichokes, and cucumber, tossed in a zesty Italian vinaigrette. (Gluten Free) Add-ons: grilled "
     "chicken +100, grilled tenderloin +125, grilled prawns +150.",
     320.00, "10-15 mins", "serves 1", "veg", labels=["gluten free"])
food("salads", "Fajita Salad",
     "Sizzling capsicum, onion, and mushroom served on a crisp bed of lettuce. Topped with rich guacamole, "
     "zesty pico de gallo, and creamy ranch dressing. (Gluten Free) Add-ons: grilled chicken +100, grilled "
     "tenderloin +125, grilled prawns +150.",
     260.00, "10-15 mins", "serves 1", "veg", labels=["gluten free"])
food("salads", "Beet Salad w/ Goat Cheese & Balsamic",
     "Fresh arugula, tangy goat cheese, crisp green apple slices, and crunchy toasted walnuts. Topped with "
     "sliced shallots and drizzled with balsamic vinaigrette, finished with crispy potato crisps. "
     "(Gluten Free)",
     320.00, "10-15 mins", "serves 1", "veg", labels=["gluten free"])

# Tacos
food("tacos", "Blackened Shrimp Taco",
     "Bold flavour of juicy blackened shrimp on a bed of zesty black bean relish, complemented by crumbled "
     "feta cheese and creamy avocado crema, nestled in a warm corn tortilla, garnished with fresh cilantro. "
     "(Gluten Free)",
     500.00, "15-20 mins", "serves 1", "non_veg", labels=["gluten free"])
food("tacos", "BBQ Oyster Mushroom Tacos",
     "Smoky oyster mushrooms paired with the bold kick of harissa paste, accented with garlic and smoked "
     "paprika powder. Served on a soft corn tortilla, topped with fresh microgreens and a drizzle of olive "
     "oil. (Gluten Free)",
     425.00, "15-20 mins", "serves 1", "veg", labels=["vegan", "gluten free", "new", "spicy"])
food("tacos", "BBQ Chicken Tacos",
     "Smoked chicken smothered in a tangy cherry BBQ sauce, combined with zesty pico de gallo and melty "
     "cheddar jack cheese, nestled on a warm corn tortilla and crowned with crispy fried onion straws. "
     "(Gluten Free)",
     325.00, "15-20 mins", "serves 1", "non_veg", labels=["gluten free"])
food("tacos", "Smoked Pork Tacos",
     "Tenderised smoked pork on a bed of fresh corn tortilla. Topped with our signature homemade "
     "strawberry jam, tangy pickled jalapenos, zesty red onion, and crumbled goat cheese. (Gluten Free)",
     525.00, "15-20 mins", "serves 1", "non_veg", labels=["gluten free"])
food("tacos", "Roasted Cauliflower Tacos",
     "Perfectly roasted cauliflower, tangy pickled radishes, spicy jalapeño crema, and fresh scallions; "
     "all served on a warm corn tortilla. (Gluten Free)",
     285.00, "15-20 mins", "serves 1", "veg", labels=["gluten free", "spicy"])

# Small Plates
food("small_plates", "Schnitzel-Style Chicken Strips",
     "Tender strips of chicken served with a side of creamy ranch dressing.",
     350.00, "15-20 mins", "serves 1-2", "non_veg")
food("small_plates", "Tex Mex Fries",
     "Zesty cajun spice blend, served with creamy beer cheese, chunky salsa, fresh guacamole, homemade "
     "sour cream, topped with sliced scallions and spicy jalapenos.",
     375.00, "15-20 mins", "serves 1-2", "veg", labels=["spicy"])
food("small_plates", "Ginger Beef Stir-Fry",
     "Tenderized beef strips paired with Chinese cabbage, bok choy, zesty ginger, fresh green onion, and "
     "a sprinkle of fragrant sesame seeds.",
     460.00, "15-20 mins", "serves 1-2", "non_veg")
food("small_plates", "Grilled Piri Piri Prawns",
     "Juicy grilled prawns infused with our piri piri marinade and drizzled with olive oil. (Gluten Free)",
     500.00, "15-20 mins", "serves 1-2", "non_veg", labels=["gluten free", "spicy"])
food("small_plates", "Sausage Platter",
     "Delicious selection of sausages including Bratwurst, Garlic Karakauer Smoked, Cheese & Chilli "
     "Chicken, and Chicken Nurenberger. (Gluten Free)",
     600.00, "15-20 mins", "serves 2", "non_veg", labels=["gluten free"])
food("small_plates", "BBQ Pork Ribs",
     "Succulent pork ribs slow-cooked to perfection with a savoury blend of garlic and rosemary, slathered "
     "in our signature BBQ sauce for a sweet and tangy finish. (Gluten Free)",
     600.00, "30-45 mins", "serves 1-2", "non_veg", labels=["gluten free", "chef special"])
food("small_plates", "Grilled Mongolian Stout Beef Skewers",
     "Grilled skewered beef marinated in a savoury blend of ginger, garlic, soy sauce, and sesame oil, "
     "with a bold twist of stout beer. (Gluten Free)",
     575.00, "15-20 mins", "serves 1-2", "non_veg", labels=["gluten free"])
food("small_plates", "Turkish Lamb Kebab",
     "Minced grilled lamb seasoned with a blend of aromatic herbs and spices. Served with a side of "
     "bourbon-infused barbecue sauce. (Gluten Free)",
     460.00, "15-20 mins", "serves 1-2", "non_veg", labels=["gluten free", "chef special"])
food("small_plates", "Salt & Pepper Prawn",
     "Crispy Oriental-style prawns tossed with salt and pepper, accompanied by a side of refreshing "
     "coleslaw.",
     400.00, "15-20 mins", "serves 1-2", "non_veg")
food("small_plates", "Chilli Fish",
     "Crispy, Oriental-style fish coated in a mouthwatering blend of spicy chilli sauce and sautéed onions "
     "and dry red chillies.",
     350.00, "15-20 mins", "serves 1-2", "non_veg", labels=["spicy"])
food("small_plates", "Manchurian Cauliflower & Baby Corn",
     "Mouth-watering flavour of our Manchurian Cauliflower and Baby Corn dish, hailed by our founder and "
     "resident Manchurian connoisseur as \"the best Manchurian sauce in Bangalore!\"",
     250.00, "15-20 mins", "serves 1-2", "veg", labels=["spicy"])
food("small_plates", "Citrus Marinated Fish Fingers",
     "Herb-crusted fish fingers with citrus marinade, served with tangy tartar sauce.",
     375.00, "15-20 mins", "serves 1-2", "non_veg")
food("small_plates", "Cajun Style Fried Devilled Eggs",
     "Boiled eggs mixed with zesty dill pickle, tangy yellow mustard, and creamy mayonnaise. Coated in "
     "crispy panko crumbs and seasoned with bold cajun spice.",
     280.00, "15-20 mins", "serves 1-2", "veg", labels=["spicy"])
food("small_plates", "Chilli Cheese Garlic Toast",
     "Crispy garlic baguette slices topped with a spicy blend of cheese and chillies. Served with your "
     "choice of dipping sauce — classic marinara or tangy ranch.",
     300.00, "10-15 mins", "serves 1-2", "veg", labels=["spicy"])
food("small_plates", "Old School Chilli Chicken",
     "A classic Bangalore favourite for the ages! Oriental style cubed chicken tossed with onion and bell "
     "pepper in spicy chilli sauce.",
     380.00, "15-20 mins", "serves 1-2", "non_veg", labels=["spicy", "bestseller"])
food("small_plates", "Spicy Stir-Fry Pot",
     "Tender lotus stem, crunchy water chestnuts, savoury mushrooms, and zesty scallions, cooked to "
     "perfection with our homemade stir-fry sauce. (Gluten Free)",
     350.00, "15-20 mins", "serves 1-2", "veg", labels=["vegan", "gluten free", "spicy"])
food("small_plates", "Pub Fries",
     "Crispy fries available in three irresistible flavours: Classic, Garlic Herb, or Cajun.",
     260.00, "10-15 mins", "serves 1-2", "veg")
food("small_plates", "Spinach & Artichoke Dip",
     "A delicious blend of spinach, artichoke, parmesan and cream cheese baked to perfection, served with "
     "homemade whole wheat pita bread.",
     325.00, "15-20 mins", "serves 1-2", "veg")
food("small_plates", "Grilled Greek Lamb Souvlaki",
     "Juicy lamb skewers paired with a classic Greek salad, freshly baked pita bread, and creamy tzatziki "
     "sauce.",
     550.00, "20-30 mins", "serves 1-2", "non_veg", labels=["chef special"])
food("small_plates", "Turkish Pide",
     "Freshly baked flatbread topped with a zesty peri peri sauce, mixed peppers, savoury mushrooms, "
     "creamy mozzarella cheese, tangy feta cheese, and garnished with fresh coriander.",
     250.00, "15-20 mins", "serves 1-2", "veg", labels=["spicy"])

# Wings
food("wings", "Cauliflower Wings",
     "Served with your choice of Ranch or Bleu Cheese Dressing. Tossed in your choice of sauce: Hot "
     "Buffalo, IPA Sriracha, Naga Jolokia, or Mexican Chipotle.",
     250.00, "15-20 mins", "serves 1-2", "veg", labels=["spicy"])
food("wings", "Chicken Wings",
     "Served with your choice of Ranch or Bleu Cheese Dressing. Tossed in your choice of sauce: Hot "
     "Buffalo, IPA Sriracha, Naga Jolokia, or Mexican Chipotle.",
     325.00, "15-20 mins", "serves 1-2", "non_veg", labels=["spicy", "bestseller"])

# Burgers
food("burgers", "The Arbor-ger",
     "An American classic with an Indian twist! Seasoned 1/4 lb all-buff patty, topped with fresh lettuce, "
     "ripe tomato, creamy mayo, and crispy onion rings. Served with your choice of Plain, Cajun, Garlic, "
     "or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.",
     500.00, "20-30 mins", "serves 1", "non_veg", labels=["bestseller"])
food("burgers", "Tex Mex Black Bean Burger",
     "Our signature homemade black bean patty, perfectly seasoned and topped with fresh pico de gallo and "
     "melted cheddar cheese. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. "
     "Choice of homemade buns: Sesame or Masala.",
     380.00, "20-30 mins", "serves 1", "veg")
food("burgers", "Mediterranean Lamb Burger",
     "Seasoned ground lamb piled high, topped with creamy melted cheese, crisp lettuce, and a kick of "
     "flavorful harissa paste. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. "
     "Choice of homemade buns: Sesame or Masala.",
     550.00, "20-30 mins", "serves 1", "non_veg", labels=["spicy"])
food("burgers", "Buffalo Chicken Burger",
     "Tender Panko-crumbed chicken coated in our homemade buffalo sauce. Topped with savoury blue cheese, "
     "crispy celery, spicy jalapeno, tangy pickles, and melted cheddar cheese. Served with your choice of "
     "Plain, Cajun, Garlic, or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.",
     480.00, "20-30 mins", "serves 1", "non_veg", labels=["spicy", "bestseller"])

# ---------------------------------------------------------------------------
# BEVERAGES
# ---------------------------------------------------------------------------

def beer(name, style, abv, ibu, desc, prices, cat="beers_on_tap"):
    full_desc = f"{desc} ({style}, ABV {abv}, IBU {ibu})"
    size_serving = {"330ml": "serves 1", "500ml": "serves 1", "1.5L pitcher": "serves 4-5"}
    for size, price in prices.items():
        bev(cat, f"{name} ({size})", full_desc, price, "5-10 mins", size_serving[size],
            labels=["bestseller"] if name in ("Bangalore Bliss", "Beachshack") and size == "500ml" else [])

beer("Easy Rider", "American Wheat", "4.9%", 10,
     "Brewed for the free spirit in all of us. As fresh as the open road with a smooth mouthfeel, a hint "
     "of citrusy fruit, a light breezy hop character.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("Phat Abbot", "Belgian Tripel", "8%", 26,
     "A happy marriage of spicy, fruity and warming alcohol flavours layered over a soft malt character. "
     "Complex fruity esters contribute notes of sweet citrus and spice and tropical fruit.",
     {"330ml": 300, "500ml": 400})
beer("Bangalore Bliss", "Hefeweizen", "5.5%", 15,
     "Classic aromas of banana, clove and floral lemon citrus blossom. Fruity, spicy aromas show a rich "
     "yeasty character on a smooth, medium-bodied palate.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("Beachshack", "West Coast IPA", "6%", 55,
     "Brilliant gold hue, creamy white head and big fresh hop aroma. Juicy American-style IPA packed with "
     "citrus and tropical fruit flavours.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("No Parking", "German Pilsner", "5.5%", 41,
     "Traditional northern German-style Pilsner brewed with all German malts and imported German Tettnang "
     "hops. Crisp and clean with a mildly salty noble hop bitterness.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("Sumac", "Witbier", "5.4%", 15,
     "A Belgian-style Witbier with lemony dried Middle-Eastern sumac berries instead of bitter orange "
     "peel, plus coriander seeds and fruity, spicy Belgian yeast esters.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("Raging Elephant", "American IPA", "6.8%", 80,
     "Old-school American IPA with a coppery-gold hue and a full cascade hop aroma. Distinct ruby-red "
     "grapefruit quality on the palate through a long satisfying finish.",
     {"330ml": 270, "500ml": 370, "1.5L pitcher": 1000})
beer("Michael Faricy", "Irish Stout", "5%", 43,
     "Enticing aromas of fresh-ground coffee and bittersweet chocolate. Chalky, roasted flavours balanced "
     "by lush dark chocolate through a smoky finish.",
     {"330ml": 240, "500ml": 320, "1.5L pitcher": 920})
beer("Smooth Criminal", "Spiced Ale", "8%", 13,
     "Brewed with lavender flowers and local forest honey. Lavender present on the nose and finish, never "
     "overbearing; honey contributes perceived sweetness with a slightly viscous mouthfeel.",
     {"330ml": 325, "500ml": 425, "1.5L pitcher": 1200})

bev("beer_cans", "Bangalore Bliss (Can)", "Canned Hefeweizen, 5.5% ABV.", 300.00, serving="serves 1")
bev("beer_cans", "Beachshack (Can)", "Canned West Coast IPA, 6% ABV.", 350.00, serving="serves 1")

# Classic Cocktails (30ml standard measure)
bev("cocktails", "Hot Toddy", "Brandy, Spices, Honey. 30ml standard measure.", 250.00)
bev("cocktails", "Cosmopolitan", "Vodka, Triple Sec, Lime Juice. 30ml standard measure.", 325.00)
bev("cocktails", "Mojito", "White Rum, Lime Juice, Soda. 30ml standard measure.", 325.00)
bev("cocktails", "Margarita", "Tequila, Orange Liqueur, Lime Juice. 30ml standard measure.", 380.00)
bev("cocktails", "Pina Colada", "White Rum, Coconut Cream, Pineapple Juice. 30ml standard measure.", 400.00)
bev("cocktails", "Long Island Iced Tea",
    "Vodka, Tequila, White Rum, Gin, Triple Sec, Lime Juice, Coke. 30ml standard measure.", 500.00)
bev("cocktails", "Whisky Sour", "Whisky, Egg White (Optional), Lime Juice. 30ml standard measure.", 600.00)

# Sangria & Wine
def wine(name, cat, glass=None, bottle=None, desc="", serving_bottle="serves 2-3"):
    if glass is not None:
        bev(cat, f"{name} (Glass)", desc, glass, serving="serves 1")
    if bottle is not None:
        suffix = " (Bottle)" if glass is not None else ""
        bev(cat, f"{name}{suffix}", desc, bottle, serving=serving_bottle)

wine("Bangalore Bliss Sangria", "sangria_wine", glass=200, bottle=800, desc="House sangria, glass or pitcher.")
items[-1]["name"] = "Bangalore Bliss Sangria (Pitcher)"
items[-1]["serving"] = "serves 4-5"
wine("Red Wine Sangria", "sangria_wine", glass=450, bottle=2200, desc="Red wine sangria, glass or pitcher.")
items[-1]["name"] = "Red Wine Sangria (Pitcher)"
items[-1]["serving"] = "serves 4-5"
wine("White Wine Sangria", "sangria_wine", glass=450, bottle=2200, desc="White wine sangria, glass or pitcher.")
items[-1]["name"] = "White Wine Sangria (Pitcher)"
items[-1]["serving"] = "serves 4-5"

wine("Fratelli Shiraz Fruit", "sangria_wine", glass=375, bottle=1750, desc="Red wine.")
wine("Fratelli Shiraz Rose", "sangria_wine", glass=375, bottle=1750, desc="Rose wine.")
wine("Fratelli Sangiovese", "sangria_wine", glass=450, bottle=2200, desc="Red wine.")
wine("Sula Cabernet Shiraz", "sangria_wine", glass=450, bottle=2150, desc="Red wine.")
wine("Lil James Basket Cosme Red", "sangria_wine", bottle=5750, desc="Red wine, bottle only.")
wine("Robertson Red Wine", "sangria_wine", bottle=3600, desc="Red wine, bottle only.")

wine("Fratelli Chardonnay", "sangria_wine", glass=400, desc="White wine, glass only.")
wine("Fratelli Sauvignon Blanc", "sangria_wine", glass=400, bottle=1900, desc="White wine.")
wine("Sula Chenin Blanc", "sangria_wine", glass=375, bottle=1750, desc="White wine.")
wine("Lil James Basket Cosme White", "sangria_wine", bottle=5750, desc="White wine, bottle only.")
wine("Robertson White Wine", "sangria_wine", bottle=3600, desc="White wine, bottle only.")

# Sparkling Wine & Champagne
bev("sparkling", "NOI Sparkling Wine", "Sparkling wine, bottle.", 2250.00, serving="serves 4-5")
bev("sparkling", "Sula Brut", "Sparkling wine, bottle.", 2750.00, serving="serves 4-5")
bev("sparkling", "Moet & Chandon", "Champagne, bottle.", 9750.00, serving="serves 4-5")

# Mocktails & Kombucha
bev("mocktails", "Fruit Punch", "Mixed fruit mocktail.", 250.00)
bev("mocktails", "Virgin Pina Colada", "Coconut cream and pineapple juice, no rum.", 250.00)
bev("mocktails", "Virgin Mary", "Tomato-based mocktail, no vodka.", 225.00)
bev("mocktails", "Watermelon Cooler", "Fresh watermelon mocktail.", 225.00)
bev("mocktails", "Virgin Mojito", "Lime, mint and soda, no rum.", 225.00)
bev("mocktails", "Passion Fruit Iced Tea", "Iced tea, passion fruit.", 225.00)
bev("mocktails", "Strawberry Iced Tea", "Iced tea, strawberry.", 225.00)
bev("mocktails", "Peach Iced Tea", "Iced tea, peach.", 225.00)
bev("mocktails", "Lemon Iced Tea", "Iced tea, lemon.", 150.00)
bev("mocktails", "Fresh Lime Soda", "Sweet or salted, served with soda.", 120.00, offers_salt=True)
bev("mocktails", "Fresh Lime Water", "Sweet or salted, still water.", 75.00, offers_salt=True)
bev("mocktails", "Mango Passion Kombucha", "House kombucha, mango passion.", 380.00)
bev("mocktails", "Pomegranate Mint Kombucha", "House kombucha, pomegranate mint.", 380.00)
bev("mocktails", "Ginger Lime Kombucha", "House kombucha, ginger lime.", 380.00)

# Spirits & Liquors (30ml standard measure)
def spirit(name, family, price, desc=""):
    d = f"{family}. 30ml standard measure. {desc}".strip()
    bev("spirits", name, d, price)

for n, p in [("Paul John Nirvana", 225), ("Ardmore Highland", 600), ("Laphroaig", 675),
             ("Bowmore 12 y/o", 700), ("Glenlivet 12 y/o", 700)]:
    spirit(n, "Single Malt Whisky", p)
for n, p in [("Desmondji 100%", 225), ("Don Angel Blanco", 300), ("Jose Cuervo Reposado", 350),
             ("Patron XO Cafe", 550), ("1800 Reserva Silver", 600), ("Creyente Mezcal", 700),
             ("Patron Reposado", 750), ("1800 Reserva Anejo", 750)]:
    spirit(n, "Tequila", p)
for n, p in [("Old Monk", 200), ("Short Story White Rum", 250), ("Kraken Black Spiced", 450),
             ("Mount Gay Eclipse", 550), ("Dipolmatico Reserva", 650)]:
    spirit(n, "Rum", p)
for n, p in [("Martell VS", 625), ("Hennessy VS", 700), ("Martell VSOP", 900),
             ("Hennessy VSOP", 1000), ("Martell XO", 1200)]:
    spirit(n, "Cognac", p)
for n, p in [("MC Brandy", 200), ("Mansion House", 225)]:
    spirit(n, "Brandy", p)
for n, p in [("Greater Than", 250), ("Short Story Dry Gin", 250), ("Stranger & Sons", 300),
             ("Stranger & Sons x The Bombay Canteen: Perry Road Peru", 375),
             ("Hapusa Himalayan Dry Gin", 400), ("Hendricks", 600), ("Roku Gin", 650),
             ("Sipsmith London Dry Gin", 650), ("Monkey 47", 800)]:
    spirit(n, "Gin", p)
for n, p in [("Short Story Grain Vodka", 250), ("Absolut Vodka Blue", 370),
             ("Tito's Handmade Vodka", 550), ("Ciroc Vodka", 600), ("Grey Goose", 650),
             ("Belvedere", 650)]:
    spirit(n, "Vodka", p)
for n, p in [("Desmondji Orange", 225), ("Kahlua", 375), ("Baileys", 575), ("Jagermeister", 575)]:
    spirit(n, "Liqueur", p)
for n, p in [("Kamikaze", 200), ("Good Day Soju", 200), ("Snake Bite", 225), ("Tequila Slammer", 225),
             ("Melon Ball", 225), ("B-52", 500), ("Jager-Bomb", 550), ("Irish Car Bomb", 550),
             ("Good Day Soju Bottle", 1900)]:
    spirit(n, "Shooter", p)
for n, p in [("Martini Bianco", 180), ("Martini Extra Dry", 180), ("Martini Rosso", 180),
             ("Aperol", 350), ("Campari", 575)]:
    spirit(n, "Aperitif", p)

# Whisky & Bourbon (30ml standard measure)
for n, p in [("Oaksmith", 200), ("Teacher's Highland", 225), ("Jameson Irish Whisky", 325),
             ("Teacher's 50", 325), ("Teacher's Golden 12 y/o", 450), ("Chivas Regal", 500),
             ("JW Black Label", 500), ("Monkey Shoulder", 600), ("Toki Suntory", 600),
             ("Royal Salute 21 y/o", 1100)]:
    bev("whisky_bourbon", n, "Whisky. 30ml standard measure.", p)
for n, p in [("Jim Beam White", 300), ("Jim Beam Black", 450), ("Jack Daniels' Tennessee", 450),
             ("Maker's Mark", 525), ("Gentleman Jack", 525), ("Michter's Bourbon", 725)]:
    bev("whisky_bourbon", n, "Bourbon whisky. 30ml standard measure.", p)

# Non-Alcoholic Beverages
bev("non_alc", "Espresso", "Single shot espresso.", 100.00, offers_ice=False)
bev("non_alc", "Double Espresso", "Double shot espresso.", 150.00, offers_ice=False)
bev("non_alc", "Americano", "Espresso with hot water.", 150.00, offers_ice=False)
bev("non_alc", "Iced Americano", "Espresso with cold water over ice.", 150.00, offers_ice=True)
bev("non_alc", "Cafe Latte", "Espresso with steamed milk.", 180.00, offers_ice=False)
bev("non_alc", "Cappuccino", "Espresso with steamed milk foam.", 180.00, offers_ice=False)
bev("non_alc", "Cold Shakerato", "Shaken iced espresso.", 180.00, offers_ice=True)
bev("non_alc", "Lemon Tea", "Black tea with lemon.", 125.00, offers_ice=False)
bev("non_alc", "Earl Grey Tea", "Classic bergamot black tea.", 125.00, offers_ice=False)
bev("non_alc", "Green Tea", "Steeped green tea.", 125.00, offers_ice=False)
for fruit in ["Apple", "Cranberry", "Guava", "Orange", "Grape", "Litchi", "Mango", "Pineapple"]:
    bev("non_alc", f"{fruit} Juice", "Freshly served juice.", 125.00, offers_ice=True)
bev("non_alc", "Soda", "Plain soda.", 75.00, offers_ice=True)
bev("non_alc", "Diet Coke", "Diet cola.", 100.00, offers_ice=True)
bev("non_alc", "Coke", "Cola.", 100.00, offers_ice=True)
bev("non_alc", "Sprite", "Lemon-lime soda.", 100.00, offers_ice=True)
bev("non_alc", "Arbor Water Bottle", "Packaged drinking water.", 120.00, offers_ice=False)
bev("non_alc", "Ginger Ale", "Ginger ale soda.", 150.00, offers_ice=True)
bev("non_alc", "Tonic Water", "Tonic water.", 150.00, offers_ice=True)
bev("non_alc", "Redbull", "Energy drink, canned.", 250.00, offers_ice=True)

# One sold_out and one archived item for realism / edge cases (existing seed pattern)
for it in items:
    if it["name"] == "Grilled Salmon (Glass)":  # never matches, placeholder guard
        pass
for it in items:
    if it["name"] == "Grilled Salmon":
        it["availability"] = "sold_out"
    if it["name"] == "Old Monk":
        it["availability"] = "sold_out"
    if it["name"] == "Banoffee Pie":
        it["status"] = "archived"
        it["desc"] = "Discontinued — kept for historical order snapshots. " + it["desc"]

# docs/product.md: "Label (at most one, picked from the restaurant's own
# label list)" — a curated promo tag (Chef Recommended, Seasonal), not a
# dietary claim. Dietary markers (vegan/gluten free/eggless) live in
# description text only, already present there — this caps every item to
# at most 1 label from the actual vocabulary, dropping anything else and
# picking a winner by priority when a call site set more than one.
LABEL_PRIORITY = ["bestseller", "chef special", "new", "spicy"]
for it in items:
    kept = [l for l in LABEL_PRIORITY if l in it["labels"]]
    it["labels"] = kept[:1]

CAT_TAX = {key: rate for key, _, rate in CATS}

# assign menu_item ids in declaration order
for i, it in enumerate(items):
    it["id"] = nid("40000000", i + 9)  # existing seed uses 1..8
by_name = {it["name"]: it for it in items}

# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------
STAFF = [
    # (key, name, email, role, status, is_primary_owner, has_auth_user)
    ("owner", "Suresh Kumar", "owner@arborbrewing.test", "owner", "active", True, True),
    ("mgr1", "Anjali Menon", "manager1@arborbrewing.test", "manager", "active", False, True),
    ("mgr2", "Rohan Mathur", "manager2@arborbrewing.test", "manager", "active", False, True),
    ("w1", "Kavya Reddy", "waiter1@arborbrewing.test", "waiter", "active", False, True),
    ("w2", "Arjun Bhat", "waiter2@arborbrewing.test", "waiter", "active", False, True),
    ("w3", "Fatima Sheikh", "waiter3@arborbrewing.test", "waiter", "active", False, True),
    ("w4", "Nikhil Pillai", "waiter4@arborbrewing.test", "waiter", "active", False, True),
    ("w5", "Sneha Gowda", "waiter5@arborbrewing.test", "waiter", "active", False, True),
    ("w6", "Deepak Achar", "waiter6@arborbrewing.test", "waiter", "active", False, True),
    ("k1", "Manoj Verma", "kitchen1@arborbrewing.test", "kitchen", "active", False, True),
    ("k2", "Farhan Ali", "kitchen2@arborbrewing.test", "kitchen", "active", False, True),
    ("k3", "Lakshmi Iyengar", "kitchen3@arborbrewing.test", "kitchen", "active", False, True),
    ("w7_invited", "Ritika Shah", "waiter7@arborbrewing.test", "waiter", "invited", False, False),
    ("w_removed", "Vinay Chandran", "waiter-alumni@arborbrewing.test", "waiter", "removed", False, True),
]
STAFF_ROWS = []
auth_n = 6
staff_n = 6
for key, name, email, role, status, is_primary, has_auth in STAFF:
    staff_id = nid("20000000", staff_n)
    staff_n += 1
    user_id = None
    if has_auth:
        user_id = nid("b0000000", auth_n)
        auth_n += 1
    STAFF_ROWS.append(dict(key=key, id=staff_id, name=name, email=email, role=role,
                            status=status, is_primary=is_primary, user_id=user_id))
staff_by_key = {s["key"]: s for s in STAFF_ROWS}

# waiter/kitchen/manager pools used for placed_by_staff_id and bill settlement
WAITER_KEYS = ["w1", "w2", "w3", "w4", "w5", "w6"]
MANAGER_KEYS = ["mgr1", "mgr2", "owner"]

# ---------------------------------------------------------------------------
# Tables & Sessions
# ---------------------------------------------------------------------------
ALL_TABLES = [f"T{i}" for i in range(1, 31)]
FREE_TABLES = {"T26", "T27", "T28", "T29", "T30"}
MERGE_GROUP = ["T20", "T21", "T22", "T23"]
LONG_TABLE = "T15"
SINGLE_TABLES = [t for t in ALL_TABLES if t not in FREE_TABLES and t not in MERGE_GROUP]
assert len(SINGLE_TABLES) == 21 and len(FREE_TABLES) == 5 and len(MERGE_GROUP) == 4

table_ctr = 5
TABLE_ID = {t: nid("60000000", table_ctr + i) for i, t in enumerate(ALL_TABLES)}

session_ctr = 3
SESSIONS = []  # dict: id, tables(list), status, opened_at_min, closed_at_min(None), rounds

def mins_ago(m):
    return f"now() - interval '{m} minutes'"

for t in SINGLE_TABLES:
    sid = nid("50000000", session_ctr)
    session_ctr += 1
    SESSIONS.append(dict(id=sid, tables=[t], opened_min=random.randint(8, 150),
                          rounds=(6 if t == LONG_TABLE else random.choice([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6])),
                          guest_only=(t == LONG_TABLE)))

merge_sid = nid("50000000", session_ctr)
session_ctr += 1
SESSIONS.append(dict(id=merge_sid, tables=MERGE_GROUP, opened_min=170, rounds=6, guest_only=False))

SESSION_BY_TABLE = {t: s["id"] for s in SESSIONS for t in s["tables"]}

HISTORICAL = []
for i in range(3):
    sid = nid("50000000", session_ctr)
    session_ctr += 1
    opened_min = random.randint(210, 360)
    closed_min = opened_min - random.randint(45, 90)
    HISTORICAL.append(dict(id=sid, opened_min=opened_min, closed_min=closed_min,
                            rounds=random.choice([2, 3, 4])))

# ---------------------------------------------------------------------------
# Menu pools for order generation
# ---------------------------------------------------------------------------
ORDERABLE = [it for it in items if it["status"] == "active" and it["name"] not in ("Grilled Salmon", "Old Monk")]
FOOD_KEYS = {"favourites", "bar_snacks", "large_plates", "pizzas", "desserts", "salads", "tacos",
             "small_plates", "wings", "burgers"}
FOOD_POOL = [it for it in ORDERABLE if it["cat"] in FOOD_KEYS]
BEV_POOL = [it for it in ORDERABLE if it["cat"] not in FOOD_KEYS]

order_ctr = 3
order_item_ctr = 6
ORDERS = []       # dict: id, session_id, placed_min, placed_by_type, placed_by_staff_key, idem
ORDER_ITEMS = []  # dict: id, order_id, item, quantity, status, preparing_min, ready_min

def new_order(session_id, placed_min, placed_by_type, placed_by_staff_key=None):
    global order_ctr
    oid = nid("80000000", order_ctr)
    order_ctr += 1
    idem = f"arbor-order-{order_ctr - 3}"
    ORDERS.append(dict(id=oid, session_id=session_id, placed_min=placed_min,
                        placed_by_type=placed_by_type, placed_by_staff_key=placed_by_staff_key, idem=idem))
    return oid

def add_order_item(order_id, item, quantity, status, preparing_min=None, ready_min=None):
    global order_item_ctr
    oiid = nid("90000000", order_item_ctr)
    order_item_ctr += 1
    ORDER_ITEMS.append(dict(id=oiid, order_id=order_id, item=item, quantity=quantity,
                             status=status, preparing_min=preparing_min, ready_min=ready_min))
    return oiid

# --- historical rounds for the 22 active sessions (served, oldest rounds) ---
for s in SESSIONS:
    n_rounds = s["rounds"]
    # last round is reserved for the live rush-queue pass below when eligible;
    # everything here is fully served history.
    completed_rounds = n_rounds - 1 if n_rounds > 1 else n_rounds
    base_gap = max(6, s["opened_min"] // max(n_rounds, 1))
    for r in range(completed_rounds):
        placed_min = s["opened_min"] - (r * base_gap)
        placed_min = max(placed_min, 12)
        by_type = "guest" if (s["guest_only"] or random.random() < 0.55) else "staff"
        staff_key = None if by_type == "guest" else random.choice(WAITER_KEYS)
        oid = new_order(s["id"], placed_min, by_type, staff_key)
        for _ in range(random.randint(1, 4)):
            pool = FOOD_POOL if random.random() < 0.6 else BEV_POOL
            it = random.choice(pool)
            add_order_item(oid, it, random.randint(1, 3), "served")

# snapshot-immutability edge case: an archived item and a since-sold-out item,
# both ordered while still active/available, sitting in old served rounds.
snapshot_session = SESSIONS[0]["id"]
snap_order = new_order(snapshot_session, SESSIONS[0]["opened_min"], "guest", None)
add_order_item(snap_order, by_name["Banoffee Pie"], 2, "served")
add_order_item(snap_order, by_name["Grilled Salmon"], 1, "served")

# cancellation edge case: one item cancelled mid-order (placed -> cancelled)
cancel_session = SESSIONS[1]["id"]
cancel_order = new_order(cancel_session, 45, "staff", "w2")
add_order_item(cancel_order, by_name["Chicken Club Pizza"], 1, "cancelled")
add_order_item(cancel_order, by_name["Coke"], 2, "served")

# --- historical closed sessions: fully served, no live queue ---
for h in HISTORICAL:
    for r in range(h["rounds"]):
        placed_min = h["opened_min"] - (r * 20)
        by_type = "guest" if random.random() < 0.5 else "staff"
        staff_key = None if by_type == "guest" else random.choice(WAITER_KEYS)
        oid = new_order(h["id"], placed_min, by_type, staff_key)
        h.setdefault("order_ids", []).append(oid)
        for _ in range(random.randint(1, 3)):
            pool = FOOD_POOL if random.random() < 0.6 else BEV_POOL
            it = random.choice(pool)
            add_order_item(oid, it, random.randint(1, 2), "served")

# ---------------------------------------------------------------------------
# Rush-hour live kitchen queue: 10 placed / 8 preparing / 7 ready DISTINCT
# dish batches, each fed by 1-4 different tables (same-dish-multiple-tables).
# ---------------------------------------------------------------------------
PLACED_DISHES = ["Arbor Loaded Nachos", "Margherita", "Chicken Wings", "Buffalo Chicken Burger",
                  "BBQ Pork Ribs", "Old School Chilli Chicken", "Chilli Cheese Bacon Fries",
                  "I Like To Party", "Pub Style Fish N' Chips", "The Arbor-ger"]
PREPARING_DISHES = ["Peri-Peri Paneer", "Chicken Club Pizza", "Sausage Platter",
                     "Fiery Chicken Alfredo", "Smoked Chicken Quesadilla", "Grilled Piri Piri Prawns",
                     "Turkish Lamb Kebab", "Baked Mac & Cheese"]
READY_DISHES = ["Beer Battered Onion Rings", "Sweet Potato Fries", "Caramel Drizzled Brownie",
                 "Spicy Fried Calamari", "Tex Mex Fries", "Cauliflower Wings", "Long Lasting Vertigo"]

# sessions eligible to carry the "current round" — excludes the snapshot
# session (kept isolated) and the session reserved as a genuinely clean
# "bill requested, kitchen fully caught up" case (see BILLS below).
clean_requested_session = SESSIONS[4]["id"]
queue_sessions = [s for s in SESSIONS if s["id"] not in (snapshot_session, clean_requested_session)]
current_order_for_session = {}

def current_order(session_id, placed_by_type="guest", placed_by_staff_key=None):
    if session_id not in current_order_for_session:
        placed_min = random.randint(2, 18)
        current_order_for_session[session_id] = new_order(session_id, placed_min, placed_by_type,
                                                            placed_by_staff_key)
    return current_order_for_session[session_id]

def feed_dish(dish, status, n_tables):
    chosen = random.sample(queue_sessions, k=min(n_tables, len(queue_sessions)))
    for s in chosen:
        by_type = "guest" if (s["guest_only"] or random.random() < 0.5) else "staff"
        staff_key = None if by_type == "guest" else random.choice(WAITER_KEYS)
        oid = current_order(s["id"], by_type, staff_key)
        qty = random.randint(1, 3)
        it = by_name[dish]
        if status == "placed":
            add_order_item(oid, it, qty, "placed")
        elif status == "preparing":
            prep_min = random.choice([2, 3, 4, 5, 6, 9, 11])  # a couple deliberately overdue (>=8)
            add_order_item(oid, it, qty, "preparing", preparing_min=prep_min)
        else:
            ready_min = random.randint(1, 7)
            prep_min = ready_min + random.randint(4, 14)
            add_order_item(oid, it, qty, "ready", preparing_min=prep_min, ready_min=ready_min)

for dish in PLACED_DISHES:
    feed_dish(dish, "placed", random.randint(1, 4))
for dish in PREPARING_DISHES:
    feed_dish(dish, "preparing", random.randint(1, 3))
for dish in READY_DISHES:
    feed_dish(dish, "ready", random.randint(1, 3))

# guarantee (not left to random.choice luck) exactly 2 of the 8 preparing
# batches cross the 8-minute overdue threshold — feed_dish's random prep_min
# draw sometimes lands only 1 dish over 8 minutes, which undersells the
# overdue-flag test this fixture exists to cover.
for dish, mins in [("Peri-Peri Paneer", 9), ("Sausage Platter", 12)]:
    oid = current_order(random.choice(queue_sessions)["id"], "guest", None)
    add_order_item(oid, by_name[dish], random.randint(1, 2), "preparing", preparing_min=mins)

# guarantee (not left to random.sample luck) the "bill requested while food
# is still cooking" edge case referenced in the BILLS section below.
still_cooking_session = SESSIONS[6]["id"]
_oid = current_order(still_cooking_session, "guest", None)
add_order_item(_oid, by_name["Peri-Peri Paneer"], 1, "preparing", preparing_min=4)

# a drinks-only round on one otherwise-quiet table, to prove the kitchen
# queue only ever shows what's actually in it (no drink-only batches above)
drinks_session = SESSIONS[-2]["id"]
drinks_order = current_order(drinks_session, "guest", None)
for name in ["Bangalore Bliss (500ml)", "Beachshack (500ml)", "Fresh Lime Soda"]:
    add_order_item(drinks_order, by_name[name], random.randint(1, 2), "served")

# ---------------------------------------------------------------------------
# Cart items (uncommitted, pre-confirm) — a few sessions mid-browse
# ---------------------------------------------------------------------------
cart_ctr = 3
CART_ITEMS = []

def add_cart(session_id, item, qty, added_by_type, staff_key=None):
    global cart_ctr
    cid = nid("70000000", cart_ctr)
    cart_ctr += 1
    CART_ITEMS.append(dict(id=cid, session_id=session_id, item=item, qty=qty,
                            added_by_type=added_by_type, staff_key=staff_key))

long_table_session = SESSION_BY_TABLE[LONG_TABLE]
add_cart(long_table_session, by_name["Phat Abbot (330ml)"], 2, "guest")
add_cart(long_table_session, by_name["Masala Peanuts"], 1, "guest")
add_cart(SESSIONS[2]["id"], by_name["Tiramisu"], 2, "guest")
add_cart(SESSIONS[3]["id"], by_name["Espresso"], 1, "staff", "w4")

# ---------------------------------------------------------------------------
# Bills
# ---------------------------------------------------------------------------
bill_ctr = 3
BILLS = []

for i, s in enumerate(SESSIONS):
    bid = nid("a0000000", bill_ctr)
    bill_ctr += 1
    status = "open"
    if s["id"] == clean_requested_session:
        status = "requested"  # clean requested: everything already served
    if s["id"] == still_cooking_session:
        status = "requested"  # edge case: bill requested while food still cooking
    BILLS.append(dict(id=bid, session_id=s["id"], status=status))

for h in HISTORICAL:
    subtotal = 0.0
    tax_by_rate = {}
    for oi in ORDER_ITEMS:
        if oi["order_id"] in h.get("order_ids", []) and oi["status"] != "cancelled":
            line = float(oi["item"]["price"]) * oi["quantity"]
            subtotal += line
            rate = CAT_TAX[oi["item"]["cat"]]
            tax_by_rate[rate] = tax_by_rate.get(rate, 0.0) + line * float(rate)
    tax_amount = sum(tax_by_rate.values())
    service_charge_rate = 0.05
    service_charge_amount = round(subtotal * service_charge_rate, 2)
    total = round(subtotal + tax_amount + service_charge_amount, 2)
    bid = nid("a0000000", bill_ctr)
    bill_ctr += 1
    settler = random.choice(MANAGER_KEYS)
    h["bill"] = dict(id=bid, subtotal=round(subtotal, 2), tax=round(tax_amount, 2),
                      service_charge=service_charge_amount, total=total,
                      service_charge_rate=service_charge_rate, settled_by=settler)

# ---------------------------------------------------------------------------
# SQL emission
# ---------------------------------------------------------------------------
out = []
w = out.append

w("-- ==========================================================================")
w("-- Arbor Brewing Company — second tenant, rush-hour fixture (Aug 2026).")
w("-- Generated by supabase/gen-arbor-seed.py from supabase/menu-1.md/menu-2.md/menu-3.md")
w("-- — do not hand-edit the generated blocks below, rerun the script instead.")
w("-- See docs/arbor-seed-notes.md for the full scenario writeup (what's seeded")
w("-- and why), so a failing test/feature can be checked against the right fixture.")
w("--")
w("-- ID scheme matches the existing fixture above: same table-prefix scheme,")
w("-- counters continue from wherever the Dineinly Test Kitchen fixture left off")
w("-- (e.g. restaurants counter 2, staff counters 6+, menu_items 9+). Same")
w("-- '0000-4000-8000' placeholder v4 nibbles, not real gen_random_uuid() output.")
w("-- ==========================================================================")
w("")

# --- restaurant ---
w("-- 1 restaurant — Arbor Brewing Company (Bengaluru brewpub, 30-table floor) ---")
w("insert into restaurants (id, name, address, city, gst_number, state, pincode, service_charge_rate, status)")
w("values (")
w(f"\t'{REST_ID}',")
w("\t'Arbor Brewing Company',")
w("\t'96, 12th Main Road, Indiranagar',")
w("\t'Bengaluru',")
w("\t'29ARBOR5678B1Z2',")
w("\t'Karnataka',")
w("\t'560038',")
w("\t0.0500,")
w("\t'active'")
w(")")
w("on conflict (id) do nothing;")
w("")

# --- auth.users + identities for linked staff ---
w("-- Staff auth identities (Email OTP dev fixtures — same individual-account")
w("-- pattern as the existing seed; docs/architecture.md's shared kitchen/waiter")
w("-- 'station account' design is agreed but not yet built, so this mirrors what")
w("-- actually ships today, not the future pairing-code flow).")
w("insert into auth.users (")
w("\tid, instance_id, aud, role, email, email_confirmed_at,")
w("\tconfirmation_token, recovery_token, email_change_token_new, email_change,")
w("\traw_app_meta_data, raw_user_meta_data, created_at, updated_at")
w(") values")
rows = []
for s in STAFF_ROWS:
    if s["user_id"] is None:
        continue
    rows.append(
        f"\t('{s['user_id']}', '00000000-0000-0000-0000-000000000000', "
        f"'authenticated', 'authenticated', '{s['email']}', now(), '', '', '', '', "
        "'{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, "
        f"'{{\"display_name\":\"{esc(s['name'])}\"}}'::jsonb, now(), now())"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

w("insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values")
rows = []
for s in STAFF_ROWS:
    if s["user_id"] is None:
        continue
    rows.append(
        f"\t('{s['user_id']}', '{s['user_id']}', "
        f"'{{\"sub\":\"{s['user_id']}\",\"email\":\"{s['email']}\",\"email_verified\":true}}'::jsonb, "
        "'email', now(), now())"
    )
w(",\n".join(rows))
w("on conflict (provider_id, provider) do nothing;")
w("")

# --- staff ---
w("-- 14 staff — owner, 2 managers, 6 waiters, 3 kitchen (all linked+active),")
w("-- 1 invited (never signed in) and 1 removed (had an account, offboarded) —")
w("-- covers the invited/active/removed status trio for RLS + roster filtering.")
w("insert into staff (id, restaurant_id, user_id, name, email, role, status, is_primary_owner) values")
rows = []
for s in STAFF_ROWS:
    uid = f"'{s['user_id']}'" if s["user_id"] else "null"
    rows.append(
        f"\t('{s['id']}', '{REST_ID}', {uid}, '{esc(s['name'])}', '{s['email']}', "
        f"'{s['role']}', '{s['status']}', {str(s['is_primary']).lower()})"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- categories ---
w(f"-- {len(CATS)} menu categories, one per menu-*.md section — Food sections at 5% tax,")
w("-- Beverage sections at 18%, matching the existing restaurant's split.")
w("insert into menu_categories (id, restaurant_id, name, sort, tax_rate, status) values")
rows = []
for i, (key, name, rate) in enumerate(CATS):
    rows.append(f"\t('{CAT_ID[key]}', '{REST_ID}', '{esc(name)}', {i}, {rate}, 'active')")
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- labels ---
w("insert into menu_labels (id, restaurant_id, name) values")
rows = [f"\t('{LABEL_ID[name]}', '{REST_ID}', '{name}')" for name in LABELS]
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- menu items ---
w(f"-- {len(items)} menu items transcribed from supabase/menu-1.md/menu-2.md/menu-3.md.")
w("-- Multi-size beers (330ml/500ml/1.5L) and glass/bottle wines become one row")
w("-- per size/pour — menu_items has a single price column, no variant table.")
w("-- Add-on notes (e.g. '+ grilled chicken 100') and wing sauce choices are")
w("-- folded into description text for the same reason — there is no add-on or")
w("-- modifier table in the current schema (see docs/core-data-model.md).")
w("insert into menu_items (")
w("\tid, restaurant_id, category_id, name, description, price, prep_time,")
w("\tserving_size, diet, availability, labels, offers_spice, offers_salt,")
w("\toffers_ice, status")
w(") values")
rows = []
for it in items:
    labels_sql = "array[" + ", ".join(f"'{esc(l)}'" for l in it["labels"]) + "]::text[]" if it["labels"] else "array[]::text[]"
    rows.append(
        f"\t('{it['id']}', '{REST_ID}', '{CAT_ID[it['cat']]}', '{esc(it['name'])}', "
        f"'{esc(it['desc'])}', {it['price']:.2f}, '{it['prep']}', '{it['serving']}', "
        f"'{it['diet']}', '{it['availability']}', {labels_sql}, "
        f"{str(it['offers_spice']).lower()}, {str(it['offers_salt']).lower()}, "
        f"{str(it['offers_ice']).lower()}, '{it['status']}')"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- table sessions (active) ---
w(f"-- {len(SESSIONS)} active table sessions — 21 single-table + 1 four-table merge")
w("-- (T20/T21/T22/T23 sharing one session: T21-23 were free tables merged into")
w("-- T20's session, per the MVP 'merge only absorbs a free table' rule).")
w("insert into table_sessions (id, restaurant_id, status, opened_at, closed_at) values")
rows = [f"\t('{s['id']}', '{REST_ID}', 'active', {mins_ago(s['opened_min'])}, null)" for s in SESSIONS]
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

w("-- 3 historical closed sessions (already turned over and settled earlier")
w("-- today) — exercises the settled-bill / closed-session read paths.")
w("insert into table_sessions (id, restaurant_id, status, opened_at, closed_at) values")
rows = [f"\t('{h['id']}', '{REST_ID}', 'closed', {mins_ago(h['opened_min'])}, {mins_ago(h['closed_min'])})"
        for h in HISTORICAL]
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- restaurant tables ---
w(f"-- 30 restaurant tables — 5 free (T26-T30), 21 single-seated, 4 merged into")
w("-- one session (T20-T23). T15 is a long communal table: one qr_token, but")
w("-- printed on 3 placards along its length, so several phones scan the exact")
w("-- same code into the exact same session simultaneously (expected, not a")
w("-- bug) — reflected here by T15 carrying unusually heavy multi-guest,")
w("-- no-staff-assist order activity rather than by any extra row.")
w("insert into restaurant_tables (id, restaurant_id, label, qr_token, session_id) values")
rows = []
for t in ALL_TABLES:
    sid = SESSION_BY_TABLE.get(t)
    sid_sql = f"'{sid}'" if sid else "null"
    qr = f"arbor-qr-table-{t.lower()}"
    rows.append(f"\t('{TABLE_ID[t]}', '{REST_ID}', '{t}', '{qr}', {sid_sql})")
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- cart items ---
w("-- Uncommitted cart items — guests/waiter mid-browse, next round not yet")
w("-- confirmed. Includes one staff-added line (waiter ordering on a guest's")
w("-- behalf) as an added_by_type edge case the original fixture didn't cover.")
w("insert into cart_items (id, restaurant_id, session_id, menu_item_id, quantity, spice, salt, ice, added_by_type, added_by_staff_id) values")
rows = []
for c in CART_ITEMS:
    staff_id = f"'{staff_by_key[c['staff_key']]['id']}'" if c["staff_key"] else "null"
    rows.append(
        f"\t('{c['id']}', '{REST_ID}', '{c['session_id']}', '{c['item']['id']}', {c['qty']}, "
        f"null, null, null, '{c['added_by_type']}', {staff_id})"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- orders ---
w(f"-- {len(ORDERS)} orders (rounds) — 1 to 6 completed rounds per active table,")
w("-- plus one live 'current round' per table feeding the rush-hour kitchen")
w("-- queue below. Distinct idempotency_key per order (globally unique column).")
w("insert into orders (id, restaurant_id, session_id, placed_at, placed_by_type, placed_by_staff_id, idempotency_key) values")
rows = []
for o in ORDERS:
    staff_id = f"'{staff_by_key[o['placed_by_staff_key']]['id']}'" if o["placed_by_staff_key"] else "null"
    rows.append(
        f"\t('{o['id']}', '{REST_ID}', '{o['session_id']}', {mins_ago(o['placed_min'])}, "
        f"'{o['placed_by_type']}', {staff_id}, '{o['idem']}')"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- order items ---
w(f"-- {len(ORDER_ITEMS)} order items. Rush-hour queue: 10 distinct dishes at")
w("-- 'placed', 8 at 'preparing' (2 deliberately over the 8-minute overdue")
w("-- threshold), 7 at 'ready' — each dish batch fed by 1-4 different tables,")
w("-- so the kitchen display shows the same dish arriving from multiple tables")
w("-- at once, exactly like real rush-hour firing.")
w("insert into order_items (id, restaurant_id, order_id, item_name, unit_price, tax_rate, diet, quantity, status, preparing_at, ready_at, menu_item_id) values")
rows = []
for oi in ORDER_ITEMS:
    it = oi["item"]
    tax_rate = CAT_TAX[it["cat"]]
    prep_sql = mins_ago(oi["preparing_min"]) if oi["preparing_min"] is not None else "null"
    ready_sql = mins_ago(oi["ready_min"]) if oi["ready_min"] is not None else "null"
    rows.append(
        f"\t('{oi['id']}', '{REST_ID}', '{oi['order_id']}', '{esc(it['name'])}', {it['price']:.2f}, "
        f"{tax_rate}, '{it['diet']}', {oi['quantity']}, '{oi['status']}', {prep_sql}, {ready_sql}, "
        f"'{it['id']}')"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

# --- bills ---
w(f"-- {len(BILLS) + len(HISTORICAL)} bills — {len(BILLS)} open/requested on the active")
w("-- sessions (amounts derived on read per docs/core-data-model.md, so left")
w("-- null here same as the existing fixture's open bill), 3 settled on the")
w("-- historical closed sessions with amounts computed from their order items")
w("-- using a simple subtotal+tax+service-charge formula — a fixture")
w("-- convenience, NOT the official tax/service/rounding formula (still TBD,")
w("-- see AGENTS.md).")
w("insert into bills (id, restaurant_id, session_id, status, service_charge_rate, subtotal, tax_amount, service_charge_amount, total, settled_at, settled_by) values")
rows = []
for b in BILLS:
    rows.append(
        f"\t('{b['id']}', '{REST_ID}', '{b['session_id']}', '{b['status']}', "
        "null, null, null, null, null, null, null)"
    )
for h in HISTORICAL:
    bl = h["bill"]
    settler_id = staff_by_key[bl["settled_by"]]["id"]
    rows.append(
        f"\t('{bl['id']}', '{REST_ID}', '{h['id']}', 'settled', {bl['service_charge_rate']}, "
        f"{bl['subtotal']:.2f}, {bl['tax']:.2f}, {bl['service_charge']:.2f}, {bl['total']:.2f}, "
        f"{mins_ago(h['closed_min'])}, '{settler_id}')"
    )
w(",\n".join(rows))
w("on conflict (id) do nothing;")
w("")

sql_text = "\n".join(out)
out_path = "arbor_seed_block.sql"
with open(out_path, "w") as f:
    f.write(sql_text)

placed_n = sum(1 for oi in ORDER_ITEMS if oi["status"] == "placed")
preparing_n = sum(1 for oi in ORDER_ITEMS if oi["status"] == "preparing")
ready_n = sum(1 for oi in ORDER_ITEMS if oi["status"] == "ready")
served_n = sum(1 for oi in ORDER_ITEMS if oi["status"] == "served")
cancelled_n = sum(1 for oi in ORDER_ITEMS if oi["status"] == "cancelled")

print(f"menu items: {len(items)} across {len(CATS)} categories")
print(f"staff: {len(STAFF_ROWS)}  tables: {len(ALL_TABLES)}  active sessions: {len(SESSIONS)}  historical: {len(HISTORICAL)}")
print(f"orders: {len(ORDERS)}  order_items: {len(ORDER_ITEMS)}  cart_items: {len(CART_ITEMS)}  bills: {len(BILLS)+len(HISTORICAL)}")
print(f"order_item status counts -> placed={placed_n} preparing={preparing_n} ready={ready_n} served={served_n} cancelled={cancelled_n}")
print(f"distinct placed-dish batches={len(set(PLACED_DISHES))} preparing={len(set(PREPARING_DISHES))} ready={len(set(READY_DISHES))}")
print(f"wrote {out_path} ({len(sql_text)} bytes)")
