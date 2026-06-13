# ShaadiSahulat — Complete Requirements Reference
> One file. Every requirement. No schemas, no JSON. Just what must be built and why.

---

## 0. Start Here — Read Both Folders First

You have two existing codebases. Read them completely before writing anything.

**`shaadisahulat-main`** is the UI reference. It has buyer/seller separation and partial cart logic. Remove the Dowry module from it entirely. Keep everything else — the UI components, role separation, and cart logic are your foundation for the whole project.

**`shaadi-sahulat-dowry`** has the Dowry estimation logic with its own standalone frontend and backend. Rename it to `shaadisahulat-dowry-logic`. Remove its standalone entry points. Extract only the core estimation logic and integrate it into the main project.


Imp you have to Take the UI refence from "shaadisahulat-main"

---

## 1. UI Consistency imp

Every screen in the entire application must look like it belongs to the same product. Use `shaadisahulat-main` as the visual reference. Same colours, same card style, same header, same buttons, same fonts everywhere. No module should look like it was built separately.


## 1.1 Serpate the Buyer And Seller imp
buyer will Do its Working only when he Signin and Seller Will Do its Working when he Signin 
Make a Landing Page , from where Both enter there Role by Login/Signup 
---


## 2. Dowry Estimation Module

### 2.1 Wedding Dress Category

Remove the separate Bridal Dress and Groom Dress categories. Replace them with a single category called Wedding Dress. When the user reaches this category in the wizard, show a radio button asking them to pick Bridal or Groom before they can set a priority. Store whichever they picked. Everything else about the other 7 categories stays the same. Total is still 8 categories.

### 2.2 Four Priority Options

Add a fourth option called Not Wanted alongside High, Medium, and Low. When a user picks Not Wanted for a category, immediately ask them: "Do you want to add this category's budget to your priority categories?" If they say yes, distribute that category's calculated amount proportionally across all categories marked High. If they say no, simply remove that amount from the total. Store their answer. Never show a Not Wanted category as a slice in the Spending Analytics chart.

### 2.3 Estimation Uses Real Product Data

After the rule engine calculates a baseline for each category, query the product database and find the cheapest 5 active products in that category. Calculate their average price. The final estimate for that category should be 60% rule engine result plus 40% database average. If fewer than 5 products exist in the database for that category, use only the rule engine result and note that the estimate came from rules only. Remember which 5 products were used — store their IDs.

### 2.4 Adjustable Sliders

After showing the estimate, let the buyer adjust each category amount using a slider. The slider should move in smaller steps for larger amounts so the buyer has finer control over expensive categories. The total budget at the top of the screen must update instantly every time any slider moves. Show the buyer a colour signal on each slider — green if their adjustment is close to the system estimate, yellow if they have moved significantly, red if they have moved very far. Store both the system's original estimate and whatever the buyer finally settled on.

### 2.5 Budget Shift Tool

Build a tool that lets the buyer move money from one category to another. It must be accessible in two ways: manually from the Dowry Estimation page through a Manage Budget button, and automatically as a popup when a buyer tries to add something to their cart that exceeds their category budget. The tool shows a simple form — pick where to take money from, enter how much, pick where to send it, confirm. Enforce these rules: the buyer cannot shift more than what remains in the source category, cannot shift money into a category they marked Not Wanted, and cannot shift from a category where they have already spent everything. Every shift must be logged permanently — record who shifted, from where, to where, how much, whether it was triggered manually or by a cart overshoot, and which product caused it if applicable.

### 2.6 Low Budget Warning on Marketplace

When the buyer opens a category page in the marketplace, check their remaining budget against the cheapest available product in that category. If their remaining budget is lower than the cheapest product, show a banner at the top of the page telling them their budget is too low and offering to open the Budget Shift tool.

### 2.7 Save Training Data

Every time a buyer completes the Dowry Estimation wizard, save their full input and results as a JSON file in a training folder on the server. This is separate from the database save — both happen on completion. This file feeds the ML model later. When a buyer confirms that a dress recommendation was helpful, copy that image into the training folder under the correct category.

---

## 3. Seller Upload Module

### 3.1 Three-Level Product Hierarchy

Every product must belong to a top-level category, then a subcategory, then a specific item type. The seller picks all three in order and cannot skip a level. The six top-level categories are Wedding Dress, Furniture, Electronics, Kitchen Items, Decoration, and Miscellaneous. Store all three levels on every product. Use them as the routing structure for the marketplace.

### 3.2 Wedding Dress: Bridal and Groom as Subcategories

Inside Wedding Dress, Bridal and Groom are subcategories, not item types. Under Bridal the item types are Lehenga, Sharara, Gharara, and Bridal Gown. Under Groom they are Sherwani, Shalwar Kameez, and Suit. Every dress product must capture colour, fabric material, embroidery heaviness, size, and whether it is new or a thrift item. Thrift means priced under PKR 50,000. New means up to PKR 150,000.

### 3.3 Subcategory Trees for All Categories

**Furniture** has five item types: Sofa Set, Bed Set, Dressing Table, Dining Table, and Wardrobe. Sofa Set needs seating configuration and material. Bed Set needs size, headboard type (one-sided or two-sided), and colour. Dining Table needs piece count (54 or 72 pieces) and seating number. All furniture needs material and condition.

**Electronics** has four item types: LED TV, Refrigerator, Washing Machine, and Air Conditioner. Each needs brand and relevant specifications — screen size for TV, capacity for fridge and washing machine, tonnage for AC.

**Kitchen Items** has two subcategories. Large Appliances covers Microwave, Juicer/Blender Set, Toaster, and Dishwasher. General Kitchen Items covers Crockery Set, Cooking Set, Pressure Cooker, Kettle and Tea Set, and Casserole Set. Crockery Set needs piece count (54 or 72), material, and colour.

**Decoration** has five item types: Fairy Lights, Artificial Flowers, Stage Setup Materials, Wall Decor, and Table Centerpieces. Fairy Lights needs indoor/outdoor, length, and colour. Flowers need type, colour, and bundle size.

**Miscellaneous** has two subcategories. Small Appliances covers Iron, Vacuum Cleaner, Pedestal Fan, and Hair Dryer. Other covers Wedding Invitations, Photography Packages, Favour Items, and Mehendi Supplies.

### 3.4 Search Through Product Descriptions

When a seller saves a product they must write a description of at least 20 words. Enforce this with an inline warning before the form can be submitted. When the product is saved, convert that description into a TF-IDF vector using the project's shared fitted vectorizer file and store that vector alongside the product. Never tell the seller about TF-IDF — just tell them a detailed description helps buyers find their product. This vector is later used by both the search bar and the recommendation engine.

### 3.5 Price Suggestion When Seller Enters Price

As soon as the seller types a price, run a lookup in the database to find comparable products. Try to find products that match exactly — same item type, same colour, same condition. If you cannot find 5 that match exactly, widen the search to same item type with any colour or condition. If you still do not have 5, widen further to anything in the same subcategory. Stop as soon as you have 5 reference products. Calculate their average and show the seller a suggested price range. 

Define how far the seller is allowed to deviate from the suggestion based on how expensive the item is — allow more flexibility at higher price points. Show a soft warning if they go beyond the allowed range. Block the listing entirely if they price above twice the database average. Store what the suggested price was, how far they deviated, whether they saw the warning, and which lookup level gave the reference.

### 3.6 Discounts

Sellers must be able to add, change, or remove a discount on any saved product at any time from their product management screen. The seller enters a percentage. The system calculates the discounted price and stores both. The buyer sees the original price crossed out with the discounted price and a percentage-off badge.

### 3.7 Dummy Data on First Run

Seed one seller account with real-looking products spread across all six categories, at least two products per subcategory. Every seeded product must have a proper description, at least one image, and all required fields filled. Generate and store the TF-IDF vector and image embedding for every seeded product at seed time so recommendations and search work immediately without waiting for new uploads.

---

## 4. Buyer Search

The search bar works across all categories at once. The buyer types at least 3 characters to trigger a search. Convert the search query into a TF-IDF vector using the same fitted vectorizer. Compare it against every product's stored TF-IDF vector. Return only products that are similar enough. Sort results by how closely they match. Show the category each result belongs to on the product card. If nothing matches, show a clear message that says no results were found — never show an empty grid.

---

## 5. Cart and Budget Overshoot

Every time a buyer adds something to their cart, check if the item price fits within their remaining budget for that category.

If the item fits, do nothing — let it through silently.

If the item slightly exceeds the budget on a smaller category like Decoration or Miscellaneous, show a gentle notice but let it through.

If the item significantly exceeds the budget on a smaller category, show a popup asking if they want to shift money from another category. Give them the option to proceed anyway.

If the item exceeds the budget on a major category like Furniture, Electronics, or Wedding Dress, show a popup with three choices: shift budget from somewhere else, continue anyway, or apply for BNPL financing.

If the overshoot on a major category is very large, additionally highlight the BNPL option more prominently.

For every item that gets added to the cart over budget, record that it was over budget, what the remaining budget was at the time of purchase, and what it became after. This data feeds the Spending Analytics module later.

---

## 6. Marketplace Features

When a buyer has completed the Dowry Estimation, show their remaining budget for the current category as a banner at the top of every category page. This updates live as they purchase things.

On every category page, provide: a price range slider filter, a colour filter, a condition filter (new or used), a city filter that prioritises the buyer's own city, and sort options for price ascending, price descending, newest first, and most relevant.

Build a wishlist — buyers can save products and view them later.

Track the last 10 products a buyer viewed and show them as recently viewed.

On the product detail page show all images in a gallery, all product details, seller name and city, and an Add to Cart button.

### 6.1 Package Suggestions

When a buyer opens the marketplace after completing Dowry Estimation, generate 4 to 5 pre-built packages automatically. Each package is one product from each of the buyer's active categories, selected to fit within their budget for that category. Generate at least: a budget package using the cheapest options, a balanced package using mid-range options, and a premium package using top-rated options. Show the total price of each package. Let the buyer swap any individual item within a package and watch the total update in real time.

---

## 7. What Must Be Remembered Across Modules

The category budget object created by the Dowry Estimation module is the financial spine of the entire buyer journey. Every module touches it. Dowry Estimation writes it. The Budget Shift tool updates it. The Order Completion process deducts from it. Spending Analytics reads it. The Marketplace banner displays it. The Cart overshoot check compares against it. 

Budget deduction happens only when an order is marked done by the buyer confirming receipt — not at checkout. The deduction must cover every item in the order, each deducted from its own category. If this update fails, retry it — do not silently skip it.

The category of every product must be stored consistently using the same set of exact strings everywhere — in the product record, in the order line item, in the budget object, and in the analytics. A mismatch in category naming between any two modules will break the deduction chain.

The TF-IDF vectorizer file must be the same file used by seller upload, buyer search, and the recommendation engine. If you ever refit the vectorizer, all existing product vectors become incomparable and must be regenerated.

