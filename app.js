//Install Command:
//npm install

//Run command:
//npm start
require('dotenv').config();

const { express, server, bodyParser, handlebars, bcrypt, saltRounds, helpers, session } = require('./dependencies.js');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

// Middleware setup
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Setup sessions
server.use(session({
    secret: process.env.SESSION_SECRET,
    name: 'admin.sid',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to make session data available in templates
server.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuthenticated || false; // Check if the user is authenticated
    res.locals.username = req.session.username || ''; // Make the username available
    next();
});

// Set view engine and configure Handlebars
server.set('view engine', 'hbs');
server.engine('hbs', handlebars.engine({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts/', // Layouts directory
    defaultLayout: 'index', // Default layout
    helpers: {
        ifEquals: function (arg1, arg2, options){
            return arg1 === arg2 ? options.fn(this): options.inverse(this);
        },
        eq: (a, b) => a === b
    }
}));

// Define the isAuthenticated middleware
function isAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        return next();
    } else {
        res.redirect('/login');
    }
}

// Serve static files from the "public" directory
server.use(express.static('public'));

// MongoDB setup
const databaseURL = process.env.DATABASE_URL; 
const mongoClient = new MongoClient(databaseURL, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Room Type Mapping
const roomTypeMapping = {
    DQ: "Deluxe Queen",
    DT: "Deluxe Twin",
    PRMR: "Premiere",
    DORM: "Dormitory",
};

// Base Prices of Rooms
const roomPrices = [
    { roomType: "Deluxe Queen", basePrice: 4800 },
    { roomType: "Deluxe Twin", basePrice: 5700 },
    { roomType: "Premiere", basePrice: 10000 },
    { roomType: "Dormitory", basePrice: 7200 }
  ];

const databaseName = "hotelDB";
const adminCollection = "adminCollection";
const reservationCollection = "reservationCollection";
const roomCollection = "roomCollection";
const paymentsCollection = "paymentsCollection"; // Collection for payments

// Admin Login Route
server.get('/', (req, res) => {
    res.render('admin-login', { layout: 'index', title: 'Admin Login' });
});

// Handle login attempts
server.post('/admin-login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username); // Log the username

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(adminCollection);

        const admin = await collection.findOne({ username: username });

        if (admin) {
            // Compare the hashed password in the database with the plain text password entered by the user
            const isMatch = await bcrypt.compare(password, admin.password);
            if (isMatch) {
                req.session.isAuthenticated = true; // Set session variable for authentication
                req.session.username = username; // Store the username
                console.log('Login successful:', username); // Log success
                res.redirect('/admin-dashboard'); // Redirect to dashboard
            } else {
                console.log('Invalid credentials'); // Log invalid login
                res.render('admin-login', { layout: 'index', title: 'Admin Login', error: 'Invalid credentials' });
            }
        } else {
            console.log('Invalid credentials'); // Log invalid login
            res.render('admin-login', { layout: 'index', title: 'Admin Login', error: 'Invalid credentials' });
        }

    } catch (error) {
        console.error('Error during admin login:', error);
        res.status(500).send('Error during login');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Render the registration page
server.get('/admin/register', (req, res) => {
    res.render('admin-register', { layout: 'index', title: 'Register Admin' });
});

// Handle registration of new admin with email
server.post('/admin/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(adminCollection);

        const existingAdmin = await collection.findOne({ username: username });

        if (existingAdmin) {
            res.render('admin-register', { layout: 'index', title: 'Register Admin', error: 'Username already exists' });
            return;
        }

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newAdmin = {
            username: username,
            password: hashedPassword, // Store the hashed password
        };

        await collection.insertOne(newAdmin);
        res.redirect('/'); // Redirect to login page after successful registration

    } catch (error) {
        console.error('Error during admin registration:', error);
        res.status(500).send('Error during registration');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Admin Payments Route with Filtering
server.get('/admin/payments', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    const { paymentStatus } = req.query; // Get the selected payment status from the query parameters

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(paymentsCollection); // Ensure this matches your database

        const query = {};

        // Filter payments based on the selected status
        if (paymentStatus) {
            query.status = paymentStatus;
        }

        const payments = await collection.find(query).toArray();

        res.render('admin-payment', {
            layout: 'index',
            title: 'Payments',
            payments,
            paymentStatus, // Maintain the selected payment status in the view
            username: req.session.username
        });

    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).send('Error fetching payments');
    } finally {
        await mongoClient.close();
    }
});
server.post('/admin-update-payment-status/:id/:bookingID', async (req, res) => {
    if (!req.session.isAuthenticated) {
      return res.redirect('/');
    }
  
    try {
      await mongoClient.connect();
      const db = mongoClient.db(databaseName);
      const paymentsCollection = db.collection('paymentsCollection');
      const bookingsCollection = db.collection(reservationCollection);
  
      const paymentId = req.params.id;
      const bookingId = req.params.bookingID;
      const { status } = req.body;
  
      if (!status) {
        throw new Error('Payment status is required.');
      }
  
      // Find the payment record by ID
      const paymentRecord = await paymentsCollection.findOne({ _id: new ObjectId(paymentId) });
      if (!paymentRecord) {
        throw new Error(`Payment record with ID ${paymentId} not found.`);
      }
  
      // Update the payment record's status
      const updatePaymentResult = await paymentsCollection.updateOne(
        { _id: new ObjectId(paymentId) },
        { $set: { status, paidDate: new Date() } }
      );
  
      if (updatePaymentResult.modifiedCount !== 1) {
        throw new Error(`Failed to update payment record with ID ${paymentId}.`);
      }
  
      console.log(`Payment with ID ${paymentId} updated successfully to status: ${status}`);
  
      // Determine the new booking status based on payment status
      const bookingStatus = status === 'paid' ? 'pending' : 'pending payment';
  
      // Update the booking's status
      const updateBookingResult = await bookingsCollection.updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status: bookingStatus, payment: status } }
      );
  
      if (updateBookingResult.modifiedCount !== 1) {
        throw new Error(`Failed to update booking record with ID ${bookingId}.`);
      }
  
      console.log(`Booking with ID ${bookingId} updated successfully to status: ${bookingStatus}`);
  
      res.redirect('/admin-payments');
    } catch (error) {
      console.error('Error updating payment status:', error);
      res.status(400).send('Error updating payment status: ' + error.message);
    } finally {
      await mongoClient.close();
    }
  });
  
// Admin Dashboard Route
server.get('/admin-dashboard', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);

        // Fetch reservations (excluding total price)
        const collection = db.collection(reservationCollection);
        const reservations = await collection.find({}, {
            projection: { totalPrice: 0 }
        }).toArray();

        // Fetch room occupancy data by type
        const roomsCollection = db.collection(roomCollection);

        // Initialize counters with simplified keys (no spaces)
        const occupiedRoomsByType = { 'Deluxe_Queen': 0, 'Deluxe_Twin': 0, 'Premiere': 0, 'Dormitory': 0 };
        const vacantRoomsByType = { 'Deluxe_Queen': 0, 'Deluxe_Twin': 0, 'Premiere': 0, 'Dormitory': 0 };
        const notReadyRoomsByType = { 'Deluxe_Queen': 0, 'Deluxe_Twin': 0, 'Premiere': 0, 'Dormitory': 0 };

        // Map room types and statuses to user-friendly keys
        const roomTypeMap = { 'DQ': 'Deluxe_Queen', 'DT': 'Deluxe_Twin', 'PRMR': 'Premiere', 'DORM': 'Dormitory' };
        const statusMapping = {
            'VR': 'Vacant',
            'VC': 'Vacant',
            'OCC': 'Occupied',
            'DND': 'Occupied',
            'ARR': 'Not Ready',
            'RS': 'Not Ready'
        };

        // Process rooms and calculate counts
        const rooms = await roomsCollection.find({}).toArray();
        rooms.forEach(room => {
            const roomType = roomTypeMap[room.roomType];
            const status = statusMapping[room.status];

            if (!roomType || !status) return; // Skip unrecognized types or statuses

            if (status === 'Occupied') {
                occupiedRoomsByType[roomType]++;
            } else if (status === 'Vacant') {
                vacantRoomsByType[roomType]++;
            } else if (status === 'Not Ready') {
                notReadyRoomsByType[roomType]++;
            }
        });

        // Calculate the total number of rooms
        const totalRooms = rooms.length;

        // Fetch total revenue for the current month
        const currentMonth = new Date();
        const firstDayOfCurrentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDayOfCurrentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        const currentMonthRevenue = await db.collection(paymentsCollection).aggregate([
            { $match: { 
                paymentDate: { $gte: firstDayOfCurrentMonth, $lte: lastDayOfCurrentMonth },
                status: "Paid" // Only include paid payments
            } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]).toArray();
        const currentMonthTotal = currentMonthRevenue.length ? currentMonthRevenue[0].total : 0;

        // Fetch total revenue for the previous month
        const firstDayOfLastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const lastDayOfLastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
        const lastMonthRevenue = await db.collection(paymentsCollection).aggregate([
            { $match: { 
                paymentDate: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth },
                status: "Paid" // Only include paid payments
            } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]).toArray();
        const lastMonthTotal = lastMonthRevenue.length ? lastMonthRevenue[0].total : 0;

        const revenueDifference = currentMonthTotal - lastMonthTotal;

        // Calculate total revenue for the current year
        const firstDayOfYear = new Date(currentMonth.getFullYear(), 0, 1);
        const lastDayOfYear = new Date(currentMonth.getFullYear(), 11, 31);
        const yearRevenue = await db.collection(paymentsCollection).aggregate([
            { $match: { 
                paymentDate: { $gte: firstDayOfYear, $lte: lastDayOfYear },
                status: "Paid" // Only include paid payments
            } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]).toArray();
        const totalYearRevenue = yearRevenue.length ? yearRevenue[0].total : 0;


        // Render data to the view
        res.render('admin-dashboard', {
            layout: 'index',
            title: 'Admin Dashboard',
            reservations,
            occupiedRoomsByType,
            vacantRoomsByType,
            notReadyRoomsByType,
            totalRooms,
            currentMonthTotal,
            lastMonthTotal,
            revenueDifference,
            totalYearRevenue,
            username: req.session.username
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Error fetching dashboard data');
    } finally {
        await mongoClient.close();
    }
});



// Admin Add Booking Route
server.get('/admin-add-booking', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.render('admin-add-booking', { 
        layout: 'index', 
        title: 'Add Booking', 
        username: req.session.username,
    });
});

// Handle Add Booking Form Submission
server.post('/admin-add-booking', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);
        const roomsCollection = db.collection(roomCollection); // Access roomCollection
        const guestCollection = db.collection("guestCollection");

        // Extract data from the form submission
        const { 
            firstName, 
            lastName, 
            roomType, 
            roomNum, 
            checkInDate, 
            checkInTime, 
            checkOutDate, 
            checkOutTime, 
            adultPax, 
            kidPax, 
            specialRequest 
        } = req.body;

        // Combine date and time fields into Date objects
        const checkIn = new Date(`${checkInDate}T${checkInTime}`);
        const checkOut = new Date(`${checkOutDate}T${checkOutTime}`);

        // Combine firstName and lastName into guestName
        const guestName = `${firstName.trim()} ${lastName.trim()}`.trim();

        // Validate checkIn and checkOut dates
        if (checkIn >= checkOut) {
            throw new Error('Check-In date and time must be before Check-Out date and time.');
        }

        // Validate adultPax and kidPax
        const adultPaxNum = parseInt(adultPax, 10);
        const kidPaxNum = parseInt(kidPax, 10);

        if (isNaN(adultPaxNum) || adultPaxNum <= 0) {
            throw new Error('Invalid number of adults.');
        }

        if (isNaN(kidPaxNum) || kidPaxNum < 0) {
            throw new Error('Invalid number of kids.');
        }

        const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in one day
        const numberOfNights = Math.round((checkOutDate - checkInDate) / oneDay); // Calculate nights
    
        if (numberOfNights <= 0) {
          throw new Error('Check-out date must be later than check-in date.');
        }
        // Ensure roomType and roomNum are arrays
        const roomTypes = Array.isArray(roomType) ? roomType : [roomType];
        const roomNumbers = Array.isArray(roomNum) ? roomNum : [roomNum];

        if (roomTypes.length !== roomNumbers.length) {
            throw new Error('The number of room types and room numbers must match.');
        }

        // Initialize totalPrice and roomDetails array
        let totalPrice = 0;
        const roomDetails = await Promise.all(
            roomTypes.map(async (type, index) => {
              const trimmedRoomNum = roomNumbers[index].trim().toUpperCase(); // Ensure consistency in room numbers
          
              // Check if roomNum exists in roomCollection
              const roomExists = await roomsCollection.findOne({ roomNum: trimmedRoomNum });
              if (!roomExists) {
                throw new Error(`Room number ${trimmedRoomNum} does not exist in the database.`);
              }
          
              // Validate roomType and calculate price
              const roomInfo = roomPrices.find((room) => room.roomType === type);
              if (!roomInfo) {
                throw new Error(`Invalid room type: ${type}`);
              }
          
              // Calculate price for the room
              const roomTotal = roomInfo.basePrice * numberOfNights;
              totalPrice += roomTotal;
          
              // Add room details
              return {
                roomType: roomInfo.roomType,
                roomNum: trimmedRoomNum,
                basePrice: roomInfo.basePrice,
                nights: numberOfNights,
                total: roomTotal,
              };
            })
          );

        console.log('Total Price:', totalPrice);
        console.log('Room Details:', roomDetails);

        // Insert the booking into the database
        const guestResult = await guestCollection.insertOne({
              firstName: firstName,
              lastName: lastName,
              bookedOn: new Date()
          });
        console.log("New guest added to collection: " + guestResult.insertedId);
        guestID = guestResult.insertedId;
        const newBooking = {
            guestID,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            roomDetails,
            adultPax: adultPaxNum,
            kidPax: kidPaxNum,
            checkIn, 
            checkOut, 
            specialRequest: specialRequest.trim() || 'None', // Default to 'None' if empty
            status: "pending",
        };

        const result = await bookingsCollection.insertOne(newBooking);

        if (result.acknowledged) {
            console.log('Booking added successfully:', result.insertedId);
            res.redirect('/admin-bookings'); // Redirect to bookings page after success
        } else {
            throw new Error('Failed to add booking to the database.');
        }
    } catch (error) {
        console.error('Error adding booking:', error);
        res.status(400).send('Error adding booking: ' + error.message);
    } finally {
        await mongoClient.close();
    }
});


// Bookings Route
server.get('/admin-bookings', async (req, res) => {
    if (!req.session.isAuthenticated) { // Check for isAuthenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const { startDate, endDate, sort } = req.query;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(reservationCollection);

        const query = {};

        // Build query based on filter inputs
        if (startDate) {
            query.checkIn = { $gte: new Date(startDate) };
        }
        if (endDate) {
            query.checkOut = { ...query.checkOut, $lte: new Date(endDate) };
        }

         // Determine the sorting order (includes time as part of the Date object)
         let sortOrder;
         if (sort === "new") {
             sortOrder = { checkIn: -1 }; // New to Old (latest date & time first)
         } else if (sort === "old") {
             sortOrder = { checkIn: 1 }; // Old to New (earliest date & time first)
         } else if (sort === "pending") {
             sortOrder = { status: -1 }; // Sort by "Done" first
         } else if (sort === "done") {
             sortOrder = { status: 1 }; // Sort by "Pending" first
         } else {
             sortOrder = {}; // Default sorting (no specific order)
         }

        // Fetch filtered and sorted bookings
        const bookings = await collection.find(query).sort(sortOrder).toArray();

        res.render('admin-bookings', {
            layout: 'index',
            title: 'Bookings',
            bookings,
            username: req.session.username,
            sort, // Pass the sort parameter to the view
            startDate,
            endDate,
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).send('Error fetching bookings');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Add Done Button Functionality
server.post('/admin-done-booking/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);

        // Update the booking status to "Done"
        const result = await bookingsCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: "done" } }
        );

        if (result.modifiedCount === 1) {
            console.log(`Booking with ID ${req.params.id} marked as Done.`);
        } else {
            console.error(`Failed to mark booking with ID ${req.params.id} as Done.`);
        }

        res.redirect('/admin-bookings'); // Redirect back to bookings page
    } catch (error) {
        console.error('Error marking booking as Done:', error);
        res.status(500).send('Error marking booking as Done');
    } finally {
        await mongoClient.close();
    }
});

// Render the booking edit page
server.get('/admin-edit-booking/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);

        // Fetch booking details by ID
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(req.params.id) });

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        // Pass booking details to the view
        res.render('admin-edit-booking', {
            layout: 'index',
            title: 'Edit Booking',
            booking, // Pass booking data to the view
            username: req.session.username,
        });
    } catch (error) {
        console.error('Error fetching booking details for editing:', error);
        res.status(500).send('Error fetching booking details');
    } finally {
        await mongoClient.close();
    }
});

// Handle booking edit form submission
server.post('/admin-edit-booking/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);

        // Extract updated fields from the form
        const { firstName, lastName, roomType, roomNum, checkIn, checkOut, adultPax, kidPax } = req.body;

        // Combine firstName and lastName into guestName
        const guestName = `${firstName.trim()} ${lastName.trim()}`.trim();

        // Validate roomNum format
        const roomNumPattern = /^[A-Z][0-9]{3}$/;
        const trimmedRoomNum = roomNum.trim().toUpperCase();
        if (!roomNumPattern.test(trimmedRoomNum)) {
            throw new Error('Invalid room number format. Room number must follow the format A101.');
        }

        // Map roomType acronyms to full names
        const roomTypeMapping = {
            DQ: 'Deluxe Queen',
            DT: 'Deluxe Twin',
            PRMR: 'Premiere',
            DORM: 'Dormitory',
        };
        const fullRoomType = roomTypeMapping[roomType] || roomType;

        // Validate check-in and check-out dates
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        if (isNaN(checkInDate) || isNaN(checkOutDate)) {
            throw new Error('Invalid date format. Please provide valid check-in and check-out dates.');
        }
        if (checkInDate >= checkOutDate) {
            throw new Error('Check-in date must be earlier than check-out date.');
        }

        // Validate adultPax and kidPax
        const adultPaxNum = parseInt(adultPax, 10);
        const kidPaxNum = parseInt(kidPax, 10);
        if (isNaN(adultPaxNum) || adultPaxNum <= 0) {
            throw new Error('Number of adults must be a positive integer.');
        }
        if (isNaN(kidPaxNum) || kidPaxNum < 0) {
            throw new Error('Number of kids must be a non-negative integer.');
        }

        // Update booking in the database
        const updateResult = await bookingsCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
                $set: {
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    guestName: guestName,
                    roomType: fullRoomType,
                    roomNum: trimmedRoomNum,
                    checkIn: checkInDate,
                    checkOut: checkOutDate,
                    adultPax: adultPaxNum,
                    kidPax: kidPaxNum,
                },
            }
        );

        if (updateResult.modifiedCount === 1) {
            console.log(`Booking with ID ${req.params.id} updated successfully.`);
            res.redirect('/admin-bookings');
        } else {
            throw new Error('Failed to update booking.');
        }
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(400).send('Error updating booking: ' + error.message);
    } finally {
        await mongoClient.close();
    }
});



server.post('/admin-delete-booking/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);

        // Delete the booking by ID
        const result = await bookingsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 1) {
            console.log(`Booking with ID ${req.params.id} deleted successfully.`);
        } else {
            console.log(`No booking found with ID ${req.params.id}.`);
        }

        res.redirect('/admin-bookings'); // Redirect back to the bookings list
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).send('Error deleting booking');
    } finally {
        await mongoClient.close();
    }
});



// Booking Details Route
server.get('/admin-booking-details/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const bookingsCollection = db.collection(reservationCollection);

        // Retrieve booking by ID
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(req.params.id) });

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        // Pass the booking details to the template
        res.render('admin-booking-details', {
            layout: 'index',
            title: 'Booking Details',
            booking
        });
    } catch (error) {
        console.error('Error fetching booking details:', error);
        res.status(500).send('Error fetching booking details');
    } finally {
        await mongoClient.close();
    }
});


// Route to display all room details
server.get('/admin-room-details', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const { roomNum } = req.query; // Get the roomNum query parameter from the search form

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(roomCollection);

        let query = {};

        // If roomNum is provided, filter by it
        if (roomNum) {
            query.roomNum = { $regex: `^${roomNum.trim()}$`, $options: 'i' }; // Case-insensitive exact match
        }

        // Fetch rooms based on the query
        const rooms = await collection.find(query).toArray();

        res.render('admin-room-details', {
            layout: 'index',
            title: 'Room Details',
            rooms, // Pass rooms to the template
            username: req.session.username,
        });

    } catch (error) {
        console.error('Error fetching room details:', error);
        res.status(500).send('Error fetching room details');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

server.post('/admin-room-status/:id', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const roomsCollection = db.collection(roomCollection);

        const roomId = req.params.id;
        const newStatus = req.body.status;

        // Validate the status input
        const validStatuses = ["VR", "VC", "OCC", "DND", "RS"];
        if (!validStatuses.includes(newStatus)) {
            return res.status(400).send('Invalid status value');
        }

        // Update the room status in the database
        const result = await roomsCollection.updateOne(
            { _id: new ObjectId(roomId) },
            { $set: { status: newStatus } }
        );

        if (result.modifiedCount === 1) {
            console.log(`Room with ID ${roomId} updated to status ${newStatus}.`);
        } else {
            console.error(`Failed to update room with ID ${roomId}.`);
        }

        res.redirect('/admin-room-details'); // Redirect back to room details page
    } catch (error) {
        console.error('Error updating room status:', error);
        res.status(500).send('Error updating room status');
    } finally {
        await mongoClient.close();
    }
});

// Route to Payments
server.get('/admin-payments', async (req, res) => {
    if (!req.session.isAuthenticated) { // Ensure the user is authenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const { paymentStatus } = req.query; // Extract the selected payment status from query parameters

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(paymentsCollection); // Ensure this matches your database's payments collection name

        const query = {};

        // Add filtering by payment status if specified
        if (paymentStatus && paymentStatus !== 'All') {
            query.status = paymentStatus; // Adjust the field name if your database uses a different field
        }

        // Fetch the filtered payments
        const payments = await collection.find(query).toArray();

        // Render the admin-payments page with filtered data
        res.render('admin-payments', {
            layout: 'index',
            title: 'Payments',
            payments,
            paymentStatus: paymentStatus || 'All', // Retain the selected filter status in the view
            username: req.session.username // Pass username for display
        });

    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).send('Error fetching payments'); // Send error response in case of issues
    } finally {
        await mongoClient.close(); // Ensure MongoDB connection is closed
    }
});


// Admin Logout Route
server.get('/admin-logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out'); // Return error response
        }
        // Redirect to admin login page after logout
        res.redirect('/'); // Redirect after session is destroyed
    });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Admin server is running on port ${PORT}`);
});
