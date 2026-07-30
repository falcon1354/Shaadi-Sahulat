# Shaadi-Sahulat Project Architecture and Structure

This document is intended as a starting point and reference guide for any LLM working on the **Shaadi-Sahulat** project. It outlines the overall architecture, detailing the purpose of each main folder, subfolder, and critical files.

## High-Level Architecture
The project operates using a microservices-like architecture with three main concurrently running servers:
1. **Node.js Backend (Port 5000):** Handles core business logic, user authentication, and standard database operations.
2. **Python Visual ML Service (Port 5002):** A Flask server dedicated to handling machine learning operations, such as image processing, product recommendations, and visual searches.
3. **React Frontend (Port 3000/5173):** A Vite-powered React single-page application (SPA) providing the user interface.

---

## 1. Node.js Backend (`/backend`)
Run with: `npm run dev` (starts on port 5000)

This is a standard Express.js application interacting with a MongoDB database (Mongoose).

### Key Files & Folders:
- **`server.js`**: The main entry point of the Express application. Sets up middleware, connects to the database, and registers routes.
- **`/routes`**: Contains route definitions that map endpoints to specific controller functions.
  - `admin.js`, `buyer.js`, `seller.js`: Routes for different user roles.
  - `dowry.js`, `categories.js`, `visual.js`: Routes for specific features and integrating with the ML service.
- **`/controllers`**: Contains the request handlers.
  - `adminController.js`, `buyerController.js`, `sellerController.js`, `dowryController.js`, `visualController.js`: Each handles the business logic for their respective domains.
- **`/models`**: Contains Mongoose schemas defining the MongoDB collections structure.
- **`/middleware`**: Custom Express middleware (e.g., authentication checks, error handling).
- **`/services`**: Contains reusable business logic and external API integrations.
- **`/config`**: Configuration files, usually for database connections or environment variable loading.

---

## 2. Python Visual ML Service (`/visual-ml-service`)
Run with: `python app.py` (starts on port 5002)

This Flask application handles computationally heavy machine learning tasks, primarily centered around visual data (images of dresses, etc.) using an EfficientNet backbone.

### Key Files & Folders:
- **`app.py`**: The main Flask application entry point. Initializes routes and ML models.
- **ML Core Logic**:
  - `model.py`: Defines the neural network architecture (EfficientNet).
  - `predictor.py`: Contains logic to run inference/predictions using the trained model.
  - `trainer.py`: Logic for training the model on the dataset.
- **Flask Routing**:
  - `seller_routes.py`, `dowry_routes.py`: Flask route definitions handling specific ML endpoints.
- **Database & Data Handling**:
  - `mongo_catalog.py`, `mongo_seller.py`: Scripts for the Python service to directly interact with MongoDB.
  - `data_loader.py`: Handles loading and preprocessing images for the ML models.
  - `embedding_index.py`, `tfidf_engine.py`: Text/Embedding based search engines.
- **Seeding Scripts**:
  - `seed_all_categories.py`, `seed_catalog.py`, `seed_dummy_data.py`: Used to populate the database and training folders with initial data.
- **Directories**:
  - **`/training_data`**: The dataset for the ML model (categorized into folders like `bridal_lehenga`, `bridal_sharara`, etc.).
  - **`/models`**: Stores the saved, pre-trained model weights.
  - **`/uploads`**: Temporary storage for user-uploaded images being processed.

---

## 3. React Frontend (`/frontend`)
Run with: `npm run dev` (starts on port 3000 via Vite)

This is the user-facing application built with React, Vite, and TailwindCSS.

### Key Files & Folders:
- **`vite.config.js` / `tailwind.config.js`**: Configuration for the bundler and styling framework.
- **`/src`**: The root of the React source code.
  - **`main.jsx`**: The React application entry point.
  - **`App.jsx`**: The root component, typically handling the main routing (react-router-dom) layout.
  - **`/components`**: Reusable React UI components (buttons, cards, forms).
  - **`/api`**: Contains services/functions configured to make HTTP requests (axios/fetch) to the Backend (port 5000) and Visual ML Service (port 5002).
  - **`/context`**: React Context files used for global state management (e.g., user session, cart).
  - **`/hooks`**: Custom React hooks.
  - **`/styles`**: Global CSS files.
  - **`/assets`**: Static assets like images, fonts, and SVGs.

---

## Typical Data Flow
1. **Standard Operations**: Frontend makes an API request -> Backend Route -> Backend Controller -> Backend Model -> MongoDB.
2. **Visual/ML Operations**:
   - The Frontend may upload an image to the Backend, which then forwards the data to the Visual ML Service.
   - Alternatively, the Frontend might directly query the Visual ML Service (port 5002) for visual search results or recommendations, and the ML Service will return predictions or visually similar item IDs, which the Frontend then resolves by querying the standard Backend for the full item details.

---

## Git Ignored Files (`.gitignore`)
The project utilizes a `.gitignore` file to exclude certain files and directories from version control. Key ignored items include:
- **`node_modules/`**: Located in the `/backend` and `/frontend` directories. Contains all the downloaded npm dependencies for Node and React.
- **`.env`**: Located in directories like `/backend` and `/frontend`. This is a critical file that contains sensitive environment variables. For example, in the `/backend`, it typically contains:
  - `PORT=5000`
  - `MONGODB_URI=mongodb+srv://...` (The MongoDB connection string with credentials)
  - `ML_SERVICE_URL=http://localhost:5001`
  - `VISUAL_ML_URL=http://localhost:5002`
- **`myvenv/` & `.venv/`**: Located in the root or inside the `visual-ml-service` directory. These are Python virtual environments used to isolate dependencies for the machine learning application.
- **`__pycache__/` & `*.pyc`**: Located inside the `visual-ml-service` directory. These are auto-generated compiled Python bytecode files.
- **`.DS_Store`**: A macOS system file generated automatically by the OS to store custom folder attributes. It can appear in any directory.
- **`*.log`**: Application log files generated during runtime.

---

## MongoDB Uploading & Database Interaction

The code responsible for saving, uploading, and synchronizing data with MongoDB is split between the Node.js backend and the Python ML service.

### 1. Node.js Backend (`/backend/models` & `/backend/controllers`)
Standard application data (users, standard product listings, orders) is handled here using the `mongoose` library.
- **`/backend/models/`**: Contains the schemas. These files define the structure of the data before it gets uploaded (e.g., `User.js`, `Product.js`, `Order.js`).
- **`/backend/controllers/`**: Contains the logic that takes user input from the API routes and saves/uploads it to MongoDB. For example, `sellerController.js` handles uploading new dresses to the catalog.
- **`/backend/seeds/`**: Contains Node.js scripts specifically designed for inserting dummy or initial data into the database.

### 2. Python Visual ML Service (`/visual-ml-service`)
The machine learning service interacts directly with MongoDB to fetch training data or bulk-upload catalogs using the `pymongo` library.
- **`mongo_catalog.py` & `mongo_seller.py`**: Python modules that directly connect to MongoDB to read from or upload specific catalog items and seller data. The ML service uses these to stay synced with the main database.
- **Seeding Scripts (`seed_all_categories.py`, `seed_catalog.py`, `seed_dummy_data.py`)**: Dedicated Python scripts designed to bulk-upload initial image metadata, categories, or dummy data straight into MongoDB. These are used primarily for setting up a fresh database with all necessary ML training items.
