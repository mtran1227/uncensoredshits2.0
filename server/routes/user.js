const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");
const User = require("../models/User");
const Bathroom = require("../models/Bathroom");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const user = new User({ username, email, password });
    await user.save();
    res.json({ message: "User registered" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const match = await user.comparePassword(password);
  if (!match) return res.status(400).json({ error: "Invalid password" });

  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// PROTECTED ACCOUNT ROUTE
router.get("/account", auth, async (req, res) => {
  const user = await User.findById(req.user.userId).select("-password");

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Sync friends count with actual friendsList length
  const actualFriendsCount = user.friendsList ? user.friendsList.length : 0;
  if (user.friends !== actualFriendsCount) {
    user.friends = actualFriendsCount;
    await user.save();
  }

  // Sync bucketList count with actual bucketList length
  const actualBucketListCount = user.bucketList ? user.bucketList.length : 0;
  if (user.bucketListCount !== actualBucketListCount) {
    user.bucketListCount = actualBucketListCount;
    await user.save();
  }

  res.json({
    username: user.username,
    email: user.email,
    friends: actualFriendsCount, // Always return the synced count
    shitIn: user.shitInCount,
    bucketList: actualBucketListCount, // Always return the synced count
    profilePhoto: user.profilePhoto
  });
});

// UPLOAD / SAVE PROFILE PHOTO (expects base64 data URL)
router.post("/uploadPhoto", auth, async (req, res) => {
  const { photo } = req.body;

  if (!photo) {
    return res.status(400).json({ error: "Photo is required" });
  }

  // Basic safety: limit size roughly by length (very rough check)
  if (photo.length > 2_000_000) {
    return res.status(400).json({ error: "Photo too large" });
  }

  const user = await User.findById(req.user.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.profilePhoto = photo;
  await user.save();

  res.json({ message: "Profile photo updated", profilePhoto: user.profilePhoto });
});

// ----------------------------
// Favorites
// ----------------------------
router.get("/favorites", auth, async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate("favorites", "name geoLocation averageRating images location");
  res.json(user?.favorites || []);
});

router.post("/favorites/:bathroomId", auth, async (req, res) => {
  const { bathroomId } = req.params;
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const exists = user.favorites.some(id => id.equals(bathroomId));
  if (exists) {
    // Removing from favorites
    user.favorites = user.favorites.filter(id => !id.equals(bathroomId));
    user.shitInCount = user.favorites.length;
  } else {
    // Adding to favorites - remove from bucketlist to prevent overlap
    const wasInBucketList = user.bucketList.some(id => id.equals(bathroomId));
    if (wasInBucketList) {
      user.bucketList = user.bucketList.filter(id => !id.equals(bathroomId));
      user.bucketListCount = user.bucketList.length;
    }
    user.favorites.push(bathroomId);
    user.shitInCount = user.favorites.length;
  }
  await user.save();
  const populated = await user.populate("favorites", "name geoLocation averageRating images location");
  res.json({ favorites: populated.favorites });
});

// ----------------------------
// Bucket list
// ----------------------------
router.get("/bucket", auth, async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate("bucketList", "name geoLocation averageRating images location");
  res.json(user?.bucketList || []);
});

router.post("/bucket/:bathroomId", auth, async (req, res) => {
  const { bathroomId } = req.params;
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const exists = user.bucketList.some(id => id.equals(bathroomId));
  if (exists) {
    // Removing from bucketlist
    user.bucketList = user.bucketList.filter(id => !id.equals(bathroomId));
  } else {
    // Adding to bucketlist - remove from favorites to prevent overlap
    const wasInFavorites = user.favorites.some(id => id.equals(bathroomId));
    if (wasInFavorites) {
      user.favorites = user.favorites.filter(id => !id.equals(bathroomId));
      user.shitInCount = user.favorites.length;
    }
    // Add to beginning of array so newest items appear at top
    user.bucketList.unshift(bathroomId);
  }
  user.bucketListCount = user.bucketList.length;
  await user.save();
  const populated = await user.populate("bucketList", "name geoLocation averageRating images location");
  res.json({ bucketList: populated.bucketList });
});

// ----------------------------
// Friends
// ----------------------------
router.get("/friends", auth, async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate("friendsList", "username profilePhoto");
  res.json(user?.friendsList || []);
});

router.get("/friend/:username", auth, async (req, res) => {
  try {
    const friend = await User.findOne({ username: req.params.username })
      .select("username profilePhoto");
    
    if (!friend) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if they are friends
    const currentUser = await User.findById(req.user.userId);
    const isFriend = currentUser.friendsList.some(id => id.equals(friend._id));

    if (!isFriend) {
      return res.status(403).json({ error: "Not a friend" });
    }

    res.json(friend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/search-users", auth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.json([]);
  }
  
  try {
    const currentUser = await User.findById(req.user.userId);
    const users = await User.find({
      username: { $regex: q, $options: "i" },
      _id: { $ne: currentUser._id }
    }).select("username profilePhoto").limit(10);
    
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/friends/:userId", auth, async (req, res) => {
  const { userId } = req.params;
  const currentUser = await User.findById(req.user.userId);
  
  if (!currentUser) return res.status(404).json({ error: "User not found" });
  if (userId === req.user.userId.toString()) {
    return res.status(400).json({ error: "Cannot add yourself as a friend" });
  }

  const friendUser = await User.findById(userId);
  if (!friendUser) return res.status(404).json({ error: "Friend not found" });

  const exists = currentUser.friendsList.some(id => id.equals(userId));
  if (exists) {
    return res.status(400).json({ error: "Already friends" });
  }

  currentUser.friendsList.push(userId);
  currentUser.friends = currentUser.friendsList.length;
  await currentUser.save();

  const populated = await currentUser.populate("friendsList", "username profilePhoto");
  res.json({ friends: populated.friendsList, friendsCount: currentUser.friends });
});

// ----------------------------
// Seed test users (for development)
// ----------------------------
router.get("/seed-users", async (req, res) => {
  // Also allow GET for easy browser access
  try {
    const testUsers = [
      { username: "deanofdump", email: "dean@example.com", password: "password123" },
      { username: "flushmaster5000", email: "flush@example.com", password: "password123" },
      { username: "stallscout", email: "stall@example.com", password: "password123" },
      { username: "toilettaster", email: "toilet@example.com", password: "password123" },
      { username: "turdtech", email: "turd@example.com", password: "password123" },
      { username: "bathboss", email: "bath@example.com", password: "password123" },
      { username: "stallveteran", email: "veteran@example.com", password: "password123" },
      { username: "papertrail", email: "paper@example.com", password: "password123" },
      { username: "tilewalker", email: "tile@example.com", password: "password123" },
      { username: "porcelainpro", email: "porcelain@example.com", password: "password123" },
      { username: "seatguru", email: "seat@example.com", password: "password123" },
      { username: "soapninja", email: "soap@example.com", password: "password123" },
      { username: "flushfanatic", email: "fanatic@example.com", password: "password123" },
      { username: "tapmaster", email: "tap@example.com", password: "password123" },
      { username: "wipewizard", email: "wipe@example.com", password: "password123" },
    ];

    const created = [];
    const skipped = [];

    for (const userData of testUsers) {
      try {
        const existing = await User.findOne({ 
          $or: [{ email: userData.email }, { username: userData.username }] 
        });
        
        if (existing) {
          skipped.push(userData.username);
        } else {
          const user = new User(userData);
          await user.save();
          created.push(userData.username);
        }
      } catch (err) {
        console.log(`Error creating ${userData.username}:`, err.message);
      }
    }

    res.json({ 
      message: "Seed complete",
      created: created.length,
      skipped: skipped.length,
      createdUsers: created,
      skippedUsers: skipped
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/seed-users", async (req, res) => {
  try {
    const testUsers = [
      { username: "deanofdump", email: "dean@example.com", password: "password123" },
      { username: "flushmaster5000", email: "flush@example.com", password: "password123" },
      { username: "stallscout", email: "stall@example.com", password: "password123" },
      { username: "toilettaster", email: "toilet@example.com", password: "password123" },
      { username: "turdtech", email: "turd@example.com", password: "password123" },
      { username: "bathboss", email: "bath@example.com", password: "password123" },
      { username: "stallveteran", email: "veteran@example.com", password: "password123" },
      { username: "papertrail", email: "paper@example.com", password: "password123" },
      { username: "tilewalker", email: "tile@example.com", password: "password123" },
      { username: "porcelainpro", email: "porcelain@example.com", password: "password123" },
      { username: "seatguru", email: "seat@example.com", password: "password123" },
      { username: "soapninja", email: "soap@example.com", password: "password123" },
      { username: "flushfanatic", email: "fanatic@example.com", password: "password123" },
      { username: "tapmaster", email: "tap@example.com", password: "password123" },
      { username: "wipewizard", email: "wipe@example.com", password: "password123" },
    ];

    const created = [];
    const skipped = [];

    for (const userData of testUsers) {
      try {
        const existing = await User.findOne({ 
          $or: [{ email: userData.email }, { username: userData.username }] 
        });
        
        if (existing) {
          skipped.push(userData.username);
        } else {
          const user = new User(userData);
          await user.save();
          created.push(userData.username);
        }
      } catch (err) {
        console.log(`Error creating ${userData.username}:`, err.message);
      }
    }

    res.json({ 
      message: "Seed complete",
      created: created.length,
      skipped: skipped.length,
      createdUsers: created,
      skippedUsers: skipped
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed reviews endpoint (for manual triggering)
router.get('/seed-reviews', async (req, res) => {
  try {
    const Rating = require('../models/Rating');
    const Bathroom = require('../models/Bathroom');
    const User = require('../models/User');
    
    const bathrooms = await Bathroom.find();
    const users = await User.find();
    
    if (bathrooms.length === 0 || users.length === 0) {
      return res.json({ error: 'No bathrooms or users found' });
    }

    const reviewComments = [
      "i met god here.", "so sh*ttable!", "Toilet paper so soft I took some home.",
      "No lock. No soap. No dignity.", "vibe immaculate.", "Best bathroom on campus, hands down.",
      "Clean and spacious, perfect for a quick break.", "The stalls are huge, very private.",
      "Smells fresh, well maintained.", "Great location, always available.",
      "Could use better ventilation.", "Love the automatic sinks!", "TP quality is top tier.",
      "Peaceful and quiet.", "Worth the walk.", "My go-to spot.", "Hidden gem.",
      "10/10 would recommend.", "Better than my apartment bathroom.", "The lighting is perfect for selfies.",
      "Cold and sterile.", "old and musty", "super nice", "Actually decent for once.",
      "Found my new favorite spot.", "Way better than expected.", "Pretty standard but gets the job done.",
      "The mirrors are huge, great for outfit checks.", "Always clean when I visit.", "Wish there were more stalls.",
      "Perfect for a quick emergency.", "The hand dryers actually work!", "Nice and quiet, good for studying breaks.",
      "Could be cleaner but it's okay.", "Love the privacy here.", "The soap smells amazing.",
      "Best kept secret on campus.", "Always empty when I need it.", "The stalls have actual locks that work!",
      "Great for avoiding crowds.", "The floor is always wet but otherwise fine.", "Found a charging port in here once!",
      "The paper towels are always stocked.", "Nice view from the window.", "The temperature is always perfect.",
    ];

    const usernames = [
      "deanofdump", "flushmaster5000", "stallscout", "toilettaster", 
      "turdtech", "bathboss", "stallveteran", "papertrail", 
      "tilewalker", "porcelainpro", "seatguru", "soapninja",
      "flushfanatic", "tapmaster", "wipewizard", "bathroomhunter",
      "stallseeker", "restroomrater", "lavatorylover", "johnnyjohn",
      "maish*tsnyc", "stern_stinker", "ghostofstall7", "bobstbathroomrat",
      "twoplytuesday", "toiletpaperking", "stallmaster", "bathroomboss"
    ];

    let created = 0;
    
    for (const bathroom of bathrooms) {
      const existingReviewCount = await Rating.countDocuments({ bathroomId: bathroom._id });
      const targetReviewCount = Math.floor(Math.random() * 4) + 4; // 4-7 reviews
      const reviewsNeeded = Math.max(0, targetReviewCount - existingReviewCount);
      
      if (reviewsNeeded === 0) continue;
      
      const shuffledUsers = [...users].sort(() => Math.random() - 0.5);
      let addedForThisBathroom = 0;
      
      for (let i = 0; i < shuffledUsers.length && addedForThisBathroom < reviewsNeeded; i++) {
        const user = shuffledUsers[i];
        const overallRating = Math.floor(Math.random() * 3) + 3;
        const comment = reviewComments[Math.floor(Math.random() * reviewComments.length)];
        const username = usernames[Math.floor(Math.random() * usernames.length)] || user.username;
        
        try {
          const existing = await Rating.findOne({ 
            bathroomId: bathroom._id, 
            userEmail: user.email 
          });
          
          if (!existing) {
            const rating = new Rating({
              bathroomId: bathroom._id,
              userId: user._id,
              userEmail: user.email,
              userName: username,
              ratings: {
                overall: overallRating,
                cleanliness: Math.max(1, Math.min(5, overallRating + Math.floor(Math.random() * 3) - 1)),
                privacy: Math.max(1, Math.min(5, overallRating + Math.floor(Math.random() * 3) - 1)),
                smell: Math.max(1, Math.min(5, overallRating + Math.floor(Math.random() * 3) - 1)),
              },
              comment: comment,
            });
            
            await rating.save();
            created++;
            addedForThisBathroom++;
          }
        } catch (err) {
          console.log(`Error creating review:`, err.message);
        }
      }
      
      // Update average rating
      const ratings = await Rating.find({ bathroomId: bathroom._id });
      if (ratings.length > 0) {
        const avg = ratings.reduce((sum, r) => sum + r.ratings.overall, 0) / ratings.length;
        await Bathroom.findByIdAndUpdate(bathroom._id, { averageRating: avg });
      }
    }
    
    res.json({ message: `Seeded ${created} reviews` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;