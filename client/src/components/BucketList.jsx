import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_URL = "http://localhost:5001/api";

const BucketList = () => {
  const [bucketList, setBucketList] = useState([]);
  const [allBathrooms, setAllBathrooms] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  // Fallback bucket list with 12 bathrooms
  const fallbackBucketList = [
    { _id: "bobst-library-4f", name: "Bobst Library 4th Floor", location: "70 Washington Square S", geoLocation: { address: "70 Washington Square S" }, averageRating: 3.5, images: [{ url: "/bathroomphotos/bobst4th.png" }] },
    { _id: "kimmel-center-2f", name: "Kimmel Center 2nd Floor", location: "60 Washington Square S", geoLocation: { address: "60 Washington Square S" }, averageRating: 4.0, images: [{ url: "/bathroomphotos/kimmel2nd.png" }] },
    { _id: "palladium-2f", name: "Palladium 2nd Floor", location: "140 E 14th St", geoLocation: { address: "140 E 14th St" }, averageRating: 4.2, images: [{ url: "/bathroomphotos/palladium2nd.png" }] },
    { _id: "metrotech-8f", name: "2 MetroTech 8th Floor", location: "2 MetroTech Center", geoLocation: { address: "2 MetroTech Center" }, averageRating: 4.9, images: [{ url: "/bathroomphotos/2metrotech8thfloor.png" }] },
    { _id: "silver-center-6f", name: "Silver Center 6th Floor", location: "100 Washington Square E", geoLocation: { address: "100 Washington Square E" }, averageRating: 3.8, images: [{ url: "/bathroomphotos/silvercenter.png" }] },
    { _id: "bobst-ll1", name: "Bobst Library LL1", location: "70 Washington Square S", geoLocation: { address: "70 Washington Square S" }, averageRating: 3.6, images: [{ url: "/bathroomphotos/bobstll1.png" }] },
    { _id: "bobst-2nd", name: "Bobst Library 2nd Floor", location: "70 Washington Square S", geoLocation: { address: "70 Washington Square S" }, averageRating: 3.7, images: [{ url: "/bathroomphotos/bobst2nd.png" }] },
    { _id: "bobst-5th", name: "Bobst Library 5th Floor", location: "70 Washington Square S", geoLocation: { address: "70 Washington Square S" }, averageRating: 3.9, images: [{ url: "/bathroomphotos/bobst5th.png" }] },
    { _id: "bobst-7th", name: "Bobst Library 7th Floor", location: "70 Washington Square S", geoLocation: { address: "70 Washington Square S" }, averageRating: 4.1, images: [{ url: "/bathroomphotos/bobst7th.png" }] },
    { _id: "kimmel-8th", name: "Kimmel Center 8th Floor", location: "60 Washington Square S", geoLocation: { address: "60 Washington Square S" }, averageRating: 4.3, images: [{ url: "/bathroomphotos/kimmel8th.png" }] },
    { _id: "stern-4th", name: "Stern 4th Floor", location: "44 W 4th St", geoLocation: { address: "44 W 4th St" }, averageRating: 3.8, images: [{ url: "/bathroomphotos/stern4th.png" }] },
    { _id: "studentlink", name: "StudentLink Center", location: "383 Lafayette St", geoLocation: { address: "383 Lafayette St" }, averageRating: 3.7, images: [{ url: "/bathroomphotos/studentlink.png" }] },
  ];

  useEffect(() => {
    fetch(`${API_URL}/user/bucket`, { headers: authHeaders() })
      .then((res) => res.json())
      .then(async (data) => {
        // Combine API data with fallback, avoiding duplicates
        const apiData = data && Array.isArray(data) ? data : [];
        
        // Fetch full bathroom data for items missing images
        const enrichedData = await Promise.all(
          apiData.map(async (bathroom) => {
            // If bathroom has images, return as is
            if (bathroom.images && bathroom.images.length > 0) {
              return bathroom;
            }
            
            // Otherwise, fetch full bathroom data to get images
            try {
              const fullBathroomRes = await fetch(`${API_URL}/bathrooms/${bathroom._id}`);
              if (fullBathroomRes.ok) {
                const fullBathroom = await fullBathroomRes.json();
                return { ...bathroom, images: fullBathroom.images || bathroom.images };
              }
            } catch (err) {
              console.log(`Error fetching full data for ${bathroom._id}:`, err);
            }
            return bathroom;
          })
        );
        
        // Remove duplicates from enriched data first (by ID)
        const seenIds = new Set();
        const uniqueEnrichedData = enrichedData.filter(b => {
          const id = normalizeId(b._id || b);
          if (!id || seenIds.has(id)) {
            return false;
          }
          seenIds.add(id);
          return true;
        });
        
        // Then filter fallback to avoid duplicates (check both ID and name)
        const fallbackToAdd = fallbackBucketList.filter(fallbackBathroom => {
          // Check if any enriched bathroom matches by ID or name
          return !uniqueEnrichedData.some(apiBathroom => 
            isDuplicate(apiBathroom, fallbackBathroom)
          );
        });
        
        // Final deduplication pass using both ID and name matching
        const finalSeen = new Set();
        const finalBucketList = [...uniqueEnrichedData, ...fallbackToAdd].filter(b => {
          const id = normalizeId(b._id || b);
          const name = normalizeName(b.name);
          const key = `${id || ''}|${name || ''}`;
          
          if (!key || finalSeen.has(key)) {
            return false;
          }
          
          // Also check if this bathroom is a duplicate of any already seen
          for (const seenKey of finalSeen) {
            const [seenId, seenName] = seenKey.split('|');
            if ((id && seenId && id === seenId) || (name && seenName && name === seenName)) {
              return false;
            }
          }
          
          finalSeen.add(key);
          return true;
        });
        
        // Backend returns items with newest first (due to unshift), so display as-is
        setBucketList(finalBucketList);
        setLoading(false);
      })
      .catch((err) => {
        console.log("Error loading bucket list:", err);
        setBucketList(fallbackBucketList);
        setLoading(false);
      });

    // Fetch all bathrooms for search/add functionality (only from database)
    fetch(`${API_URL}/bathrooms`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const bathrooms = Array.isArray(data) ? data : [];
        console.log(`Loaded ${bathrooms.length} bathrooms from database for search`);
        setAllBathrooms(bathrooms);
        if (bathrooms.length === 0) {
          console.warn("No bathrooms found in database. The search may not work until bathrooms are added.");
        }
      })
      .catch((err) => {
        console.error("Error loading all bathrooms:", err);
        setAllBathrooms([]);
      });
  }, []);

  const addToBucketList = async (bathroomId) => {
    if (!bathroomId) {
      alert("Invalid bathroom ID");
      return;
    }
    
    console.log('Adding bathroom to bucket list:', bathroomId);
    
    try {
      const response = await fetch(`${API_URL}/user/bucket/${bathroomId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add bathroom");
      }
      
      const data = await response.json();
      console.log('Successfully added to bucket list:', data);
      
      // Refresh bucket list immediately
      const refreshResponse = await fetch(`${API_URL}/user/bucket`, { 
        headers: authHeaders() 
      });
      const refreshData = await refreshResponse.json();
      
      // Combine API data with fallback, avoiding duplicates
      const apiData = refreshData && Array.isArray(refreshData) ? refreshData : [];
      
      // Fetch full bathroom data for items missing images
      const enrichedData = await Promise.all(
        apiData.map(async (bathroom) => {
          // If bathroom has images, return as is
          if (bathroom.images && bathroom.images.length > 0) {
            return bathroom;
          }
          
          // Otherwise, fetch full bathroom data to get images
          try {
            const fullBathroomRes = await fetch(`${API_URL}/bathrooms/${bathroom._id}`);
            if (fullBathroomRes.ok) {
              const fullBathroom = await fullBathroomRes.json();
              return { ...bathroom, images: fullBathroom.images || bathroom.images };
            }
          } catch (err) {
            console.log(`Error fetching full data for ${bathroom._id}:`, err);
          }
          return bathroom;
        })
      );
      
      // Remove duplicates from enriched data first (by ID)
      const seenIds = new Set();
      const uniqueEnrichedData = enrichedData.filter(b => {
        const id = normalizeId(b._id || b);
        if (!id || seenIds.has(id)) {
          return false;
        }
        seenIds.add(id);
        return true;
      });
      
      // Then filter fallback to avoid duplicates (check both ID and name)
      const fallbackToAdd = fallbackBucketList.filter(fallbackBathroom => {
        // Check if any enriched bathroom matches by ID or name
        return !uniqueEnrichedData.some(apiBathroom => 
          isDuplicate(apiBathroom, fallbackBathroom)
        );
      });
      
      // Final deduplication pass using both ID and name matching
      const finalSeen = new Set();
      const finalBucketList = [...uniqueEnrichedData, ...fallbackToAdd].filter(b => {
        const id = normalizeId(b._id || b);
        const name = normalizeName(b.name);
        const key = `${id || ''}|${name || ''}`;
        
        if (!key || finalSeen.has(key)) {
          return false;
        }
        
        // Also check if this bathroom is a duplicate of any already seen
        for (const seenKey of finalSeen) {
          const [seenId, seenName] = seenKey.split('|');
          if ((id && seenId && id === seenId) || (name && seenName && name === seenName)) {
            return false;
          }
        }
        
        finalSeen.add(key);
        return true;
      });
      
      // Backend returns items in order (newest first due to unshift), so maintain that order
      // The newly added bathroom should already be at the top from the API response
      setBucketList(finalBucketList);
      
      setShowAddModal(false);
      setSearchTerm("");
    } catch (err) {
      console.error("Error adding to bucket list:", err);
      alert(err.message || "Failed to add bathroom to bucket list");
    }
  };

  // Use only bathrooms from database for search (fallback bathrooms can't be added via API)
  const allAvailableBathrooms = allBathrooms;

  const filteredBathrooms = allAvailableBathrooms.filter((b) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return false;
    const name = (b.name || "").toLowerCase();
    const location = (b.location || "").toLowerCase();
    const address = (b.geoLocation?.address || "").toLowerCase();
    return name.includes(q) || location.includes(q) || address.includes(q);
  });

  // Helper function to normalize IDs for comparison
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id.toLowerCase().trim();
    if (id._id) return id._id.toString().toLowerCase().trim();
    if (id.toString) return id.toString().toLowerCase().trim();
    return null;
  };

  // Helper function to normalize bathroom name for comparison
  const normalizeName = (name) => {
    if (!name) return '';
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  // Helper function to check if two bathrooms are duplicates (by ID or name)
  const isDuplicate = (b1, b2) => {
    const id1 = normalizeId(b1._id || b1);
    const id2 = normalizeId(b2._id || b2);
    
    // If IDs match, they're duplicates
    if (id1 && id2 && id1 === id2) {
      return true;
    }
    
    // If names match (normalized), they're likely duplicates
    const name1 = normalizeName(b1.name);
    const name2 = normalizeName(b2.name);
    if (name1 && name2 && name1 === name2) {
      return true;
    }
    
    return false;
  };

  // Check if bathroom is already in bucket list
  const isInBucketList = (bathroomId) => {
    if (!bathroomId) return false;
    const normalizedId = normalizeId(bathroomId);
    return bucketList.some((b) => {
      const bucketId = normalizeId(b._id || b.bathroomId?._id);
      return bucketId === normalizedId;
    });
  };

  const renderCardImage = (item) => {
    // Handle both API response structure and fallback structure
    const imageUrl = item?.images?.[0]?.url || item?.images?.[0];
    if (imageUrl) {
      // If it's already a full URL, return it; otherwise prepend / if it starts with bathroomphotos
      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
      // Ensure it starts with / for relative paths
      return imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
    }
    // Use a unique placeholder based on bathroom name to avoid all showing the same image
    const nameHash = item?.name ? item.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const placeholderIndex = nameHash % 5; // Use 5 different placeholder images
    const placeholders = [
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80&sig=1",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80&sig=2",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80&sig=3",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80&sig=4"
    ];
    return placeholders[placeholderIndex];
  };

  return (
    <div className="p-8 max-w-6xl mx-auto bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-6 mb-8">
        <Link to="/home" className="cursor-pointer">
          <div className="bg-blue-600 text-white px-3 py-1 inline-block rounded font-propaganda tracking-wide">
            UNCENSORED
          </div>
          <div className="text-blue-600 text-4xl font-propaganda leading-none tracking-wide">SH*TS</div>
        </Link>
        <Link to="/account" className="ml-auto text-blue-600 underline">
          ← Back to Account
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-blue-600 text-3xl font-propaganda">Bucket List</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
        >
          + Add Bathroom
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {bucketList.map((b, index) => {
            const uniqueKey = b._id || `bucket-${index}-${b.name}`;
            return (
            <Link
              to={`/bathrooms/${b._id}`}
              key={uniqueKey}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition"
            >
              <img
                src={renderCardImage(b)}
                alt={b.name}
                className="w-full h-32 object-cover"
              />
              <div className="p-3">
                <div className="text-blue-600 font-bold text-sm mb-1 flex items-center gap-2">
                  {b.name}
                </div>
                <p className="text-gray-500 text-xs">
                  {b.geoLocation?.address || b.location || "NYU Campus"}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-blue-600 font-bold text-lg flex items-center gap-1">
                    {(b.averageRating || 0).toFixed(1)} ⭐
                  </div>
                  <button className="px-4 py-1 bg-blue-600 text-white text-sm rounded-full hover:bg-blue-700">
                    visit
                  </button>
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}

      {/* Add Bathroom Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-blue-600 text-2xl font-propaganda">add your next shit spot</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchTerm("");
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <input
              type="text"
              placeholder="Search for a bathroom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 rounded-lg outline-none mb-4"
            />
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchTerm.trim() === "" ? (
                <p className="text-gray-500 text-center py-4">Start typing to search for bathrooms...</p>
              ) : filteredBathrooms.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-2">No bathrooms found matching "{searchTerm}".</p>
                  <p className="text-gray-400 text-sm">Try searching by name, location, or address.</p>
                </div>
              ) : (
                filteredBathrooms.map((b) => {
                  const bathroomId = b._id?.toString() || b._id;
                  const alreadyAdded = isInBucketList(bathroomId);
                  return (
                    <div
                      key={bathroomId}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="text-blue-600 font-bold">{b.name || "Unnamed Bathroom"}</div>
                        <div className="text-gray-500 text-sm">
                          {b.geoLocation?.address || b.location || "NYU Campus"}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <span className="text-green-600 font-bold text-sm px-3">Already Added</span>
                      ) : (
                        <button
                          onClick={() => addToBucketList(bathroomId)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BucketList;




