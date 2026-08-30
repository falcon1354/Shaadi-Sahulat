
MarketPlace 

There are only CATfory That how , but there is not any Subcategery in maetplace , even i added (admin ) added the Subscateogy , sho when we hover to Catgory then Subcategory Name Automactaiy Show .

change the icon to simiar that was added by admin . (as its was in Thrift ). So the Thridt and Reatil both have the Same Icon . 
 Change the 



0. Buyer Dashboard 
Top of The page is hidden because
of Nevbar , So reive the Navbar and Notifcation button too . and Add the Add to CART AT LOW rIGHT Side .
Dashboard (Buyer)
1) ther is a Card called Active shopping (Delete it ).
Add scroll bar in dasboard to show all the category. inside the (Category Budget vs Expenditure).
2) Remove (Remove Smart Project) from dashboard 
. I corto category Budget vs EJ
3) Add
new category in pie chart only when amount is added in that Category from (Reallocate Budget Between Categories) .Else Not add taht Category inside the Pie chart  in that category.
4) Also Inside (Category Breakdown ) , (Remaining Cashflow) 
show only Those Cateogry only when add amount  from (Reallocate Budget Between Categories) inside the Dowry Budget Estimation


1. Marketplace 

1) Remove
share Link button .
2) Also
open Product on any where click pthe Product  Not only  bY vIEW (Deatils button ). even remove the that Button .
3) Change the UI of Product Card in (Product Listing ) 

1.1 Marketplace -> Product Detail Page 

1) In Thrift show only one price cut . Not multiple price cuts as you already Show .

2) Inside the ( Reatil and thrift ) Show Image Bar (multile Image) inside every PDP. and when we Click on Seconday Images then Open the Seocnday Images In the main image Place .
3) Add Retail and Thrift to URL . and if the PDP is oen from thirft then by back button Go to thrift . and same things from retail.
4) rmove Rectly added Section  from Thrift marketplace

2. Buyer Profile (My Account)
1) Show Dynamic
toal orders and Dynamic bandage. (Like base on 
-orders). not Remain
static.
e.g ehen new Account create then L1 bandget and 0 orders . and when the Order completed then bandage move from L1 to L2 and additions in orders


3. My Orders
1) show Past 5 order instead of 10 ,Also add option of  (Delivered,  Confirmed, Cancelled)
as seprate.
3.1  indiviudal My order Card
2) show subtotal
and items as seprate
from text at right Side .
3) Remove "Placed" . only show "Payment"  as BNPL or "COD"  in text only . nOt detail 
4) Write name of the Prodcut 
write "+"+ "Number" ( if more than one Product ).

5) there is not any Delivery type (like Fast , 1 day is written ) . also add it .

4. Checkout 
1)  Remove Search address field
2)  write Address as field 4, City Qy field 2 and The suggestion model will work. on Address Province as field 3. as Autofill Field 2 and field 3.
3) Move the House number Below after Above Fileds
4) Increase the Size of Suggestion of loction model


5. order Place


1) If BNPL base  Then show Submit BNPL Request button only .  Not view order button .
2) If base upon "cash on delivery" then show View Order button only. remove logic and button of continue Shoping or Shipping .



if the Banker "Cancelled the request then Show as Rejected in Timeline as Red ". and Close the Order as Reject . and also added it in Log of Admin.



6. Indiual My Order Detail 
1) i find bug that even i added the Shipping by Buyer , but it not added Total , write it as Subtotal (original Cost ) and shipping as (0)
2) If the BNPL base reques , then not made as package item . becaseu there is still Banker approval pending .

Note :
Only that orders Goes to Seller that are either Conformed by Banker and Place by "cod".els Not Show it as Order in "Ordes to Fulfill ".




6. BNPL
1) show Past 5 BNPL i ,Also add option of  (Rejected , Offer accpeted , Pending , Cancelled)
as seprate.
3.1  indiviudal My order Card
2) show subtotal
and items as seprate
from text at right Side .
3) Remove "Placed" . only show "Payment"  as BNPL or "COD"  in text only . nOt detail 
4) Write name of the Prodcut 
write "+"+ "Number" ( if more than one Product ).

5) there is not any Delivery type (like Fast , 1 day is written ) . also add it .



Seller 

2. Orders to Fullfill

1) show Past 5 order instead of 10 ,Also add option of  ( Delivered,  Confirmed, Cancelled)
as seprate.
2.1  indiviudal Order card
2) show subtotal
and items as seprate
from text at right Side .
3) Not write the PKG---  in Order to Fullfill for now . it will just show "Orders" not , insetead Show it as 
Order ID "order ID" ,  Buyer "buyer Name" etc 

2.2 
1) When click on "Marks Preparing" then at run time the PKG- will create at runtime 
2) when Deiverd Done , then instead of writting All things in Card , write important Things in Card , and Add the "Add Detial " in that to Show all detail as we Show to Buyer 

2.3 Order Deatil ()
1) write the Order id there . and when aftaer "maked shipping" after that PKG-XX will apear else not 
2) i also see that Phone , address Delivet type is not written any where , add it there . 
3) Also added subtotal including the dlivery that was selected by buyer.
4) Also added the Oder Place Date and Time too .
5) Cahnge the indivial Order by Seller Url like we Did in buyers (e.g (orders/ORD-2026-31207) how to change it it in term of of Seller . also adde dhte Hasing in Url so that Buyer will not able to open the Seller by chagne of Url ).




Upload Product 
1) if the CAtegory that the Admin Added as THirft or Reatil , then only Show that Button .

2) If thrift then we already have the Orginal price button , but the Remove the Price button and discount or cut "button." just place it inside the Green Box , and write Disounted Price 

3) Check Did the Multiple images option is woring or not .
4) I also see that when i Click on upload , it give me errors ""Upload failed.

5) Also whn the is upload at that time make the IF-idf , and Store (i not know did this is already happen or not ). so that it will help in Search 


Dashboard

1) total Product , must be Dynamic , total Orders must also b dynamic , remove the avg prive card .
2) remove the Revenue trend
3) change the Active Categories as it show only Category that in which the Buyer upload item , if the Seller Upload in new catrofty , then Also show that too. in that .
4) Move the Recent Orders Completed to Financial Projection .
5) remove the Top Merchant Listings.



Fincaial Projection 

1) Change the Final Projection into Dynamic things . When Seller upload Product Change things accoring to that, +1 in  Total Orders
like Totl Revenue , 

2) Make A line chart , that Past 7 Day Order wise chart and Past 7 days Revuew Base chart . (and you have to Adjust i Base uon Order and prices ). (e.g at 2 order the Max hight of hcart is rs7000 , and reven ue is rs4500 , when 3rd order done hight of chart reach rs75000 and revenue is 63000 ) . either use any formula or anyother things.
3) remove the Reenue option , alsi net Profit 
4) Make the Tancrtion Dynamic like if more than one product is Solde then you have to Adjust it base upon that too.


My Account 

Make eeverythings Dynamic like order Done 


Order to Fullfill 
1) show Past 5 orders i ,Also add option of  (Pending , disute etc )every ne that we have in orders .
as seprate.
3.1  indiviudal My order Card
2) show subtotal
and items as seprate
from text at right Side .
3) Remove "Placed" . only show "Payment"  as BNPL or "COD"  in text only . nOt detail 
4) Write name of the Prodcut 
write "+"+ "Number" ( if more than one Product ).
 
UI Task -> My Product 
1) SECTION 1: PAGE HEADER (Top Bar)
Left side: Large page title text — "My Products"
Right side: Seller profile mini-card containing:
Circular avatar with store initial (letter inside circle)
Store name in bold
Subtitle text showing total product count




Upload Product  -> weeding Dress
For Bridal we have Sharara, Lengha, Bridal Gown , Bridal Gown . there is notsubcatrogy for Maxi , Also added in Weeding dress .

Make thm availe for upload image "image Base similary Search" , i think we have to make the emdding or naythings you have to Check the Logic that was done with old Dresses.
Also do it of new upload (even it is from New Product or Thrift item)



2) SECTION 2: CATEGORY FILTER TABS (Horizontal Pill Navigation)
A horizontal row of clickable filter buttons/pills directly below the header
Each pill contains: a small left icon + label text
Pills shown: "All" (with  icon),and Each Catefory in which the Seller Upload Product , not include others if he not uplload in that category , and it must be Dynamic if the Seller upload in new Cateory tha that must be also Shown  .
One pill is visually active/selected (different background color — golden/brown tone)
The rest are inactive (light/white background)


3) SECTION 3: FILTER & SORT TOOLBAR (Control Bar)
A single horizontal bar below the category pills containing four controls:
Search Input: Text field with placeholder "Search" and a search icon button on the right end of the input
Status Dropdown: Label "Status" above it, dropdown showing options like "Available", "Sold", "Freeze" with a downward arrow.
Condition Dropdown: Label "Condition" above it, dropdown showing options like "Thrift", "Retail" with a downward arrow
Sort By Dropdown: Label "Sort By" above it, dropdown showing options like "Price: Low-High", "Price: High-Low", with a downward arrow.


4) SECTION 4: PRODUCT LIST CONTAINER
The main body area where products are displayed
The list is divided into grouped sections by Category
5) SECTION 5: CATEGORY GROUP HEADER (Collapsible Section Header)
A full-width row that acts as a header for each category group
Contains from left to right:
-> A small square category thumbnail/image
-> A right-facing arrow icon ">" (indicates expand/collapse functionality)
-> Category name in ALL CAPS bold text (e.g., "WEDDING WEAR", "ELECTRONICS")
This header sits above all product rows belonging to that category


Product Image — A square thumbnail image positioned on the left side of the row, immediately to the right of the checkbox.
Product Info Block — Contains the product name displayed in bold text. Directly underneath the name is a subtitle line in lighter/smaller text showing the subcategory name and condition in parentheses, Thrift or reatil


Stock Block — Two lines of text stacked vertically. The top line shows the quantity number (for example "5"). The bottom line shows the label "In Stock".
Pricing Block — Two lines of text stacked vertically. The top line shows the original price with currency symbol (for example "PKR 66,870"). The bottom line shows the discounted sale price prefixed with the word "Sale:" (for example "Sale: 62,010").
Status Badge — A rounded pill-shaped badge displaying the text "Available","Freeze" It appears in two visual style variants: one with a green or mint colored background, and another with a grey or silver colored background.

Action Buttons — Three buttons placed on the far right end of the row. Each button combines an icon with text label. The buttons are: Edit (pencil icon), Delete or Del (trash bin icon), and Marketplace (external link or box-with-arrow icon). These buttons may be arranged vertically stacked or horizontally side by side.




Admin
1. Dashboard
Make the "Products by Category" Also Base upon Seller upload , like the bar that Show Also have Dash or Cut base upon Seller Uploads

1) Make the "Category Distribution" Also Base upon Seller upload .
2) Mkae me A line chart base upon Selles Done by all the Seller 
3) Remove the  All Products (Read-Only).
4) remove the Dowry estimation card
5) Products per Seller (Live)

6) inside Dashborad Show buyer or Seller Wise Product and Order taht was soled , and in catrofy how many product sale , and which product is Sold more . etc 

2. Admin Wallet
Add the remove button , only to those which have to any Product Upload

3. Orders 
1) Add the past 10 Orders record and make them as as pagination .
2) inside th order make a seprate where All the order whose payment is pedin must be written , 
and add the timer with of 1 day to relaese the payment . if not done by maually auto payment will be done after 24 hours

