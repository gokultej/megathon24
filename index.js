import express from "express";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { MongoClient } from "mongodb"; // Import MongoDB client
import bcrypt from "bcrypt"; // Import bcrypt for password hashing

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MongoDB connection setup
const url = "mongodb://localhost:27017"; // Replace with your MongoDB connection string
const client = new MongoClient(url);
const dbName = "analysisDB"; // Replace with your database name
let db;
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log(`Connected to database: ${dbName}`);
    } catch (err) {
        console.error('Failed to connect to the database', err);
    }
}
connectToDatabase();

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Home page.html"));
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    try {
        const user = await db.collection("users").findOne({ username });
        if (!user) {
            return res.status(400).send('Invalid username or password'); // User not found
        }
  
        const isMatch = await bcrypt.compare(password, user.password); // Check if password matches
        if (!isMatch) {
            return res.status(400).send('Invalid username or password'); // Incorrect password
        }
  
        // Successful login, redirect to /analyze
        res.redirect('/analyze'); // Redirect to the analyze page
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html')); // Adjust the path as necessary
});

// Serve the register page
app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "register.html")); // Adjust the path if necessary
});

// Register route for creating new users
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
        const newUser = {
            username,
            password: hashedPassword
        };

        // Insert new user into the users collection
        const result = await db.collection("users").insertOne(newUser);
        console.log(`User registered with ID: ${result.insertedId}`);
        res.send('User registered successfully!');
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user');
    }
});

// Serve the HTML file for analysis
app.get("/analyze", (req, res) => {
    res.sendFile(path.join(__dirname, "analyze.html")); // Adjust the path if necessary
});


// Endpoint to receive input, process it, and respond
app.post("/analyze", async (req, res) => {
    const userInput = req.body.text;

    try {
        // Send a POST request to the Python API
        const response = await fetch("http://localhost:5000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: userInput })
        });

        // Process the response from the Python API
        const data = await response.json();

        // Prepare the document to be inserted into MongoDB
        const document = {
            userInput: userInput,
            sentls: data.sentiment.label, // Sentiment label as 'sentls'
            sentco: data.sentiment.score, // Sentiment score (confidence) as 'sentco'
            emolabel: data.emotion.emotion, // Emotion type as 'emolabel'
            emoco: data.emotion.confidence, // Emotion confidence as 'emoco'
            keywords: data.emotion.keywords, // Emotion keywords
            timestamp: new Date() // Current date and time
        };

        // Insert the document into the MongoDB collection
        const result = await db.collection("analysisResults").insertOne(document);
        console.log(`Document inserted with _id: ${result.insertedId}`);

        // Respond with the saved data
        res.json(document); // Return the document to confirm it was saved
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "An error occurred while processing the request." });
    }
});

// New endpoint to fetch the latest analysis result
app.get("/getInputData", async (req, res) => {
    try {
        const data = await db.collection("analysisResults").findOne({}, { sort: { timestamp: -1 } });
        if (!data) {
            return res.status(404).json({ message: 'No data found' });
        }

        // Prepare the response format
        const response = {
            userInput: data.userInput,
            sentls: data.sentls,
            sentco: data.sentco,
            emolabel: data.emolabel,
            emoco: data.emoco,
            keywords: data.keywords,
            timestamp: data.timestamp
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: 'Error fetching data' });
    }
});

// New endpoint to serve report.js
app.get("/report", (req, res) => {
    res.sendFile(path.join(__dirname, "report2.html")); // Adjust path if needed
});

// New endpoint to fetch all analysis results
app.get("/getAllData", async (req, res) => {
    try {
        const data = await db.collection("analysisResults").find({}).toArray(); // Fetch all records
        res.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: 'Error fetching data' });
    }
});

// Server setup
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
