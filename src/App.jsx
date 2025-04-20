import React, { useState, useEffect } from "react";
import { utils, writeFile } from "xlsx";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shifts = {
  Opening: "9:30am-5:30pm",
  Midshift: "4pm - 9pm",
  Closing: "5pm - 1am",
};

const shiftColors = {
  Opening: "bg-blue-200 dark:bg-blue-800",
  Midshift: "bg-green-200 dark:bg-green-800",
  Closing: "bg-red-200 dark:bg-red-800",
};

const shiftDurations = {
  Opening: 8,
  Midshift: 5,
  Closing: 8,
};
// test
const hourGoalOptions = [8, 16, 24, 32, 40];

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState({});
  const [customTimes, setCustomTimes] = useState({});
  const [roles, setRoles] = useState({ manager: false, insider: false, driver: false });
  const [hourGoal, setHourGoal] = useState(40);
  const [schedule, setSchedule] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [roleRequirements, setRoleRequirements] = useState(() => {
    const saved = localStorage.getItem('roleRequirements');
    if (saved) {
      return JSON.parse(saved);
    }
    
    // Default requirements
    const defaultRequirements = {};
    days.forEach(day => {
      defaultRequirements[day] = {
        manager: {
          Opening: 1,
          Midshift: 1,
          Closing: 1
        },
        driver: {
          Opening: 1,
          Midshift: 1,
          Closing: 1
        },
        insider: {
          Opening: 1,
          Midshift: 1,
          Closing: 1
        }
      };
    });
    return defaultRequirements;
  });

  // Load dark mode preference
  useEffect(() => {
    const isDark = localStorage.getItem("darkMode") === "true";
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Save dark mode preference
  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem("darkMode", isDark.toString());
  };

  // Load employee data from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("employeeData");
      if (saved) {
        const parsed = JSON.parse(saved);
        setEmployees(parsed);
        generateSchedule(parsed);
      }
    } catch (error) {
      console.error("Error loading employee data:", error);
      // Clear corrupted data
      localStorage.removeItem("employeeData");
    }
  }, []);

  // Save employee data and update schedule
  useEffect(() => {
    try {
      localStorage.setItem("employeeData", JSON.stringify(employees));
      generateSchedule();
    } catch (error) {
      console.error("Error saving employee data:", error);
    }
  }, [employees]);

  // Regenerate schedule when role requirements change
  useEffect(() => {
    generateSchedule();
  }, [roleRequirements]);

  // Save role requirements to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('roleRequirements', JSON.stringify(roleRequirements));
    } catch (error) {
      console.error("Error saving role requirements:", error);
    }
  }, [roleRequirements]);

  const toggleAvailability = (day, shiftKey) => {
    setAvailability((prev) => {
      const currentDay = prev[day] || {};
      return {
        ...prev,
        [day]: {
          ...currentDay,
          [shiftKey]: !currentDay[shiftKey],
        },
      };
    });
  };

  const updateCustomTime = (day, field, value) => {
    setCustomTimes(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  const updateCustomShiftType = (day, shiftType) => {
    setCustomTimes(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        shiftType: prev[day]?.shiftType === shiftType ? "" : shiftType // Toggle if same value
      }
    }));
  };

  const toggleCustomTime = (day) => {
    setCustomTimes(prev => {
      if (prev[day]?.start) {
        const newTimes = { ...prev };
        delete newTimes[day];
        return newTimes;
      } else {
        return {
          ...prev,
          [day]: { start: "", end: "", shiftType: "" }
        };
      }
    });
  };

  const countAvailableShifts = (employee) => {
    return Object.values(employee.availability || {}).reduce((total, shiftSet) => {
      return total + Object.values(shiftSet).filter(Boolean).length;
    }, 0);
  };

  const getScheduledHours = (empName, day, currentSchedule = schedule) => {
    let totalHours = 0;
    const daySchedule = currentSchedule[day] || {};

    // Iterate through all shifts the employee might be assigned to on this day
    Object.entries(daySchedule).forEach(([shiftKey, assignedEmployees]) => {
      if (Array.isArray(assignedEmployees)) {
        // Find the specific assignment object for this employee on this shift
        const assignment = assignedEmployees.find(a => a.name === empName);

        if (assignment) {
          const shiftType = shiftKey.split('-')[1]; // Opening, Midshift, Closing
          // If it's a custom assignment and has customHours stored, use that
          if (assignment.isCustom && typeof assignment.customHours === 'number') {
            totalHours += assignment.customHours;
          }
          // Otherwise (regular shift or custom shift missing hours), use standard duration
          else if (shiftDurations[shiftType]) {
            totalHours += shiftDurations[shiftType];
            if (assignment.isCustom) {
               console.warn(`[Hour Calc] Custom assignment for ${empName} on ${shiftKey} missing customHours. Using standard duration ${shiftDurations[shiftType]}.`);
            }
          } else {
             console.warn(`[Hour Calc] Unknown shiftType ${shiftType} for ${empName} on ${day}. Cannot add hours.`);
          }
        }
      }
    });

     // Add hours for custom times NOT tied to a specific shift type (rare case now)
     const employeeObj = employees.find(e => e.name === empName);
     if (employeeObj) {
          const customTime = employeeObj.customTimes?.[day];
          if (customTime?.start && customTime?.end && !customTime.shiftType) {
               // Check if this time slot is ALREADY accounted for by being linked to a shift
               // This check is tricky and might not be perfectly accurate without more context
               // For now, assume these are separate if not linked via shiftType
              const start = new Date(`1970-01-01T${customTime.start}:00`);
              const end = new Date(`1970-01-01T${customTime.end}:00`);
               if (!isNaN(start) && !isNaN(end) && end > start) {
                   const standaloneCustomHours = (end - start) / (1000 * 60 * 60);
                   // console.log(`[Hour Calc] Adding standalone custom hours for ${empName} on ${day}: ${standaloneCustomHours.toFixed(1)}`);
                   totalHours += standaloneCustomHours;
               }
          }
     }


    return totalHours;
  };

  const getTotalHoursForEmployee = (empName, currentSchedule = schedule) => {
    let total = 0;
    for (const day of days) {
      // Pass the potentially in-progress schedule to getScheduledHours
      total += getScheduledHours(empName, day, currentSchedule);
    }
    return total;
  };


  // --- REVISED AND CORRECTED getDailyTotalHours ---
  const getDailyTotalHours = (day) => {
    let totalHours = 0;
    const daySchedule = schedule[day] || {};

    // Iterate through each shiftKey (e.g., "Monday-Opening")
    Object.entries(daySchedule).forEach(([shiftKey, assignedEmployees]) => {
      const shiftType = shiftKey.split('-')[1]; // Get Opening, Midshift, Closing

      if (Array.isArray(assignedEmployees)) {
        assignedEmployees.forEach(assignment => {
          // Prioritize specific custom hours if stored on the assignment
          if (assignment.isCustom && typeof assignment.customHours === 'number') {
            totalHours += assignment.customHours;
             // console.log(`[Daily Total ${day}] Adding custom hours ${assignment.customHours.toFixed(1)} for ${assignment.name} (${shiftKey})`);
          }
          // Otherwise, use the standard duration for the shift type
          else if (shiftDurations[shiftType]) {
            totalHours += shiftDurations[shiftType];
             // console.log(`[Daily Total ${day}] Adding standard hours ${shiftDurations[shiftType]} for ${assignment.name} (${shiftKey})`);
          } else {
             console.warn(`[Daily Total ${day}] Unknown shiftType ${shiftType} for assignment ${assignment.name}. Cannot add hours.`);
          }
        });
      }
    });

    return totalHours;
  };


  const generateSchedule = (currentEmployees = employees) => {
    console.log("--- Starting Schedule Generation ---");
    const newSchedule = {};
    const currentWeekHours = {}; // Track hours assigned *during* this run
  
    // Initialize empty schedule and hour tracker
    currentEmployees.forEach(emp => {
      currentWeekHours[emp.name] = 0; // Start everyone at 0 for this run
    });
    days.forEach(day => {
      newSchedule[day] = {};
      ['Opening', 'Midshift', 'Closing'].forEach(shift => {
        newSchedule[day][`${day}-${shift}`] = []; // Initialize shift slots as arrays
      });
    });
  
    // --- Phase 1: Pre-assign custom times tied to specific shifts (Respecting Caps) ---
    console.log("\n--- Phase 1: Pre-assigning Custom Times ---");
    days.forEach(day => {
      const customRolesFilledThisDay = {
          Opening: { manager: 0, driver: 0, insider: 0 },
          Midshift: { manager: 0, driver: 0, insider: 0 },
          Closing: { manager: 0, driver: 0, insider: 0 }
      };
  
      currentEmployees.forEach(emp => {
        const customTime = emp.customTimes?.[day];
        if (customTime?.start && customTime?.end && customTime.shiftType) {
          const shiftType = customTime.shiftType;
          const shiftKey = `${day}-${shiftType}`;
  
          const alreadyAssignedThisShift = newSchedule[day]?.[shiftKey]?.some(e => e.name === emp.name);
          if (alreadyAssignedThisShift) {
            // console.warn(` [Custom Time] Skipping duplicate assignment for ${emp.name} to ${shiftKey}.`); // Less verbose
            return;
          }
  
          const baseRequirements = roleRequirements[day] || {};
          const shiftRequirements = baseRequirements[shiftType] || {};
  
          let assignedRoleForCustom = null;
           if (emp.roles.manager && (shiftRequirements.manager || 0) > 0) assignedRoleForCustom = 'manager';
           else if (emp.roles.driver && (shiftRequirements.driver || 0) > 0) assignedRoleForCustom = 'driver';
           else if (emp.roles.insider && (shiftRequirements.insider || 0) > 0) assignedRoleForCustom = 'insider';
  
           if (!assignedRoleForCustom) {
               // console.log(` [Custom Time] Skipping ${emp.name} for ${shiftKey}. No required role match.`);
               return;
           }
  
          const currentFilledCount = customRolesFilledThisDay[shiftType]?.[assignedRoleForCustom] || 0;
          const requiredCount = shiftRequirements[assignedRoleForCustom] || 0;
  
          if (currentFilledCount >= requiredCount) {
            // console.log(` [Custom Time] Skipping ${emp.name} as ${assignedRoleForCustom} for ${shiftKey}. Role cap (${requiredCount}) met.`);
            return;
          }
  
          const start = new Date(`1970-01-01T${customTime.start}:00`);
          const end = new Date(`1970-01-01T${customTime.end}:00`);
          let customHours = 0;
           if (!isNaN(start) && !isNaN(end) && end > start) {
              customHours = (end - start) / (1000 * 60 * 60);
           } else {
              console.warn(`[Custom Time] Invalid time for ${emp.name} on ${day}: ${customTime.start}-${customTime.end}`);
           }
  
          const hoursAfterCustom = currentWeekHours[emp.name] + customHours;
          if (hoursAfterCustom > emp.hourGoal && currentWeekHours[emp.name] > 0) {
            // console.log(` [Custom Time] Skipping ${emp.name} for ${shiftKey} (Custom) - exceeds goal.`);
            return;
          }
  
          console.log(` [Custom Time] Assigning ${emp.name} as ${assignedRoleForCustom} to ${shiftKey} (${customTime.start}-${customTime.end}, ${customHours.toFixed(1)} hrs). Cap: ${currentFilledCount+1}/${requiredCount}. Hours: ${currentWeekHours[emp.name].toFixed(1)} -> ${hoursAfterCustom.toFixed(1)} / ${emp.hourGoal}`);
          newSchedule[day][shiftKey].push({
              name: emp.name, roles: emp.roles, isCustom: true,
              customDisplay: formatCustomTime(customTime.start, customTime.end), customHours: customHours
          });
          currentWeekHours[emp.name] = hoursAfterCustom;
          customRolesFilledThisDay[shiftType][assignedRoleForCustom]++;
        }
      });
    });
  
  
    // --- Phase 2: Assign regular shifts based on Priority ---
    console.log("\n--- Phase 2: Assigning Regular Shifts (Prioritized) ---");
    days.forEach(day => {
      console.log(`\nProcessing ${day}:`);
  
      // --- Calculate Shift Priorities ---
      const shiftPriorities = ['Opening', 'Midshift', 'Closing'].map(shiftType => {
          const shiftKey = `${day}-${shiftType}`;
          const baseRequirements = {
            manager: roleRequirements[day]?.manager?.[shiftType] || 0,
            driver: roleRequirements[day]?.driver?.[shiftType] || 0,
            insider: roleRequirements[day]?.insider?.[shiftType] || 0
          };
  
          const currentAssignments = newSchedule[day][shiftKey] || [];
          const rolesAlreadyFilled = { manager: 0, driver: 0, insider: 0 };
          currentAssignments.forEach(assignment => {
              if (assignment.roles.manager) rolesAlreadyFilled.manager++;
              if (assignment.roles.driver) rolesAlreadyFilled.driver++;
              if (assignment.roles.insider) rolesAlreadyFilled.insider++;
          });
  
          const remainingNeeds = {
              manager: Math.max(0, baseRequirements.manager - rolesAlreadyFilled.manager),
              driver: Math.max(0, baseRequirements.driver - rolesAlreadyFilled.driver),
              insider: Math.max(0, baseRequirements.insider - rolesAlreadyFilled.insider),
          };
          const totalRemainingNeed = remainingNeeds.manager + remainingNeeds.driver + remainingNeeds.insider;
  
          if (totalRemainingNeed === 0) {
              return { shiftType, score: Infinity }; // Already filled, lowest priority
          }
  
          // Calculate Scarcity Score: Count unique available employees for *needed* roles
          const availableCandidates = new Set();
          currentEmployees.forEach(emp => {
              // Check if employee is available for the shift and *not* already assigned anywhere today
              const alreadyAssignedToday = Object.values(newSchedule[day]).flat().some(e => e.name === emp.name);
              if (emp.availability?.[day]?.[shiftType] && !alreadyAssignedToday) {
                  // Check if they can fill a *needed* role
                  if ((remainingNeeds.manager > 0 && emp.roles.manager) ||
                      (remainingNeeds.driver > 0 && emp.roles.driver) ||
                      (remainingNeeds.insider > 0 && emp.roles.insider))
                  {
                      availableCandidates.add(emp.name);
                  }
              }
          });
          // Lower score (fewer candidates) = higher priority. Avoid division by zero.
          const score = availableCandidates.size > 0 ? totalRemainingNeed / availableCandidates.size : 0;
          console.log(` -> Priority Calc for ${shiftKey}: Needs M:${remainingNeeds.manager},D:${remainingNeeds.driver},I:${remainingNeeds.insider} (Total:${totalRemainingNeed}). Candidates: ${availableCandidates.size}. Score: ${score.toFixed(2)}`);
          return { shiftType, score };
  
      }).sort((a, b) => {
          if (a.score !== b.score) {
            // Handle potential Infinity scores correctly (lowest priority)
            if (!isFinite(a.score)) return 1;
            if (!isFinite(b.score)) return -1;
            // Sort by score (lower score = higher priority)
            return a.score - b.score;
          }
          // Tie-breaking: Prioritize Closing > Opening > Midshift
          const tieOrder = { 'Closing': 1, 'Opening': 2, 'Midshift': 3 };
          return tieOrder[a.shiftType] - tieOrder[b.shiftType];
      });
  
      console.log(`    Shift Processing Order for ${day}: ${shiftPriorities.map(p => `${p.shiftType}(${isFinite(p.score) ? p.score.toFixed(2) : 'Inf'})`).join(', ')}`);
  
      // --- Process Shifts in Prioritized Order ---
      shiftPriorities.forEach(({ shiftType }) => {
          // Check if score is Infinity (meaning already filled), skip if so
          if (!isFinite(shiftPriorities.find(p => p.shiftType === shiftType)?.score)) {
             console.log(` -> Skipping ${day}-${shiftType} as requirements were met in Phase 1.`);
             return;
          }
  
          const shiftKey = `${day}-${shiftType}`;
          console.log(` -> Processing Prioritized Shift: ${shiftKey}`);
          const shiftHourDuration = shiftDurations[shiftType];
  
          // Recalculate remaining needs *at the time of processing* as previous shifts might affect availability
          const baseRequirements = {
            manager: roleRequirements[day]?.manager?.[shiftType] || 0,
            driver: roleRequirements[day]?.driver?.[shiftType] || 0,
            insider: roleRequirements[day]?.insider?.[shiftType] || 0
          };
          const currentAssignments = newSchedule[day][shiftKey];
          const rolesAlreadyFilled = { manager: 0, driver: 0, insider: 0 };
          currentAssignments.forEach(assignment => {
              if (assignment.roles.manager) rolesAlreadyFilled.manager++;
              if (assignment.roles.driver) rolesAlreadyFilled.driver++;
              if (assignment.roles.insider) rolesAlreadyFilled.insider++;
          });
          const requiredRoles = { // These are the roles we still need to fill in the passes
              manager: Math.max(0, baseRequirements.manager - rolesAlreadyFilled.manager),
              driver: Math.max(0, baseRequirements.driver - rolesAlreadyFilled.driver),
              insider: Math.max(0, baseRequirements.insider - rolesAlreadyFilled.insider),
          };
          let totalRequired = requiredRoles.manager + requiredRoles.driver + requiredRoles.insider;
  
          if (totalRequired <= 0) {
              console.log(`    Requirements for ${shiftKey} already met (likely by Phase 1). Skipping passes.`);
              return;
          }
           console.log(`    Needs for Passes: M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}`);
  
  
          // Sort employees: Prioritize non-clopening, then by current hours (dynamic)
          const potentialEmployees = [...currentEmployees].sort((a, b) => {
            let conflictA = 0;
            let conflictB = 0;

            // Check for potential clopening conflict ONLY if the current shift is Opening
            if (shiftType === 'Opening') {
                conflictA = wouldCreateClopeningConflict(a.name, day, newSchedule) ? 1 : 0;
                conflictB = wouldCreateClopeningConflict(b.name, day, newSchedule) ? 1 : 0;
            }

            // Primary sort: Penalize clopening (0 = no conflict, 1 = conflict)
            if (conflictA !== conflictB) {
                return conflictA - conflictB; // Sort 0s before 1s
            }

            // Secondary sort: Lower hours first
            return (currentWeekHours[a.name] || 0) - (currentWeekHours[b.name] || 0);
        });
  
          // --- Assignment Pass 1: UNDER OR AT hour goal ---
          console.log(`    Starting Pass 1 (Under/At Goal) for ${shiftKey}`);
          let assignedInPass1 = new Set();
           potentialEmployees.forEach(emp => {
               if (totalRequired <= 0) return;
  
               const empCurrentHours = currentWeekHours[emp.name] || 0;
               const hoursAfterShift = empCurrentHours + shiftHourDuration;
  
               const alreadyAssignedThisShift = newSchedule[day]?.[shiftKey]?.some(e => e.name === emp.name);
               let alreadyAssignedTodayElsewhere = false;
               for (const sk in newSchedule[day]) {
                   if (sk !== shiftKey && newSchedule[day][sk]?.some(e => e.name === emp.name)) {
                       alreadyAssignedTodayElsewhere = true;
                       break;
                   }
               }
  
               // MODIFIED Check: Consider BOTH standard availability and relevant custom times
               const isAvailable = emp.availability?.[day]?.[shiftType] || emp.customTimes?.[day]?.shiftType === shiftType;

               if (alreadyAssignedThisShift || alreadyAssignedTodayElsewhere || !isAvailable) {
                   return; // Skip if unavailable or already working today/this shift
               }
  
               if (hoursAfterShift <= emp.hourGoal) {
                   let assignedRole = null;
                   if (emp.roles.manager && requiredRoles.manager > 0) assignedRole = 'manager';
                   else if (emp.roles.driver && requiredRoles.driver > 0) assignedRole = 'driver';
                   else if (emp.roles.insider && requiredRoles.insider > 0) assignedRole = 'insider';
  
                   if (assignedRole) {
                       console.log(`     ASSIGN (P1): ${emp.name} as ${assignedRole} to ${shiftKey}. Hours: ${empCurrentHours.toFixed(1)} -> ${hoursAfterShift.toFixed(1)} / ${emp.hourGoal}. Needs left: M:${requiredRoles.manager- (assignedRole==='manager'?1:0)}, D:${requiredRoles.driver - (assignedRole==='driver'?1:0)}, I:${requiredRoles.insider- (assignedRole==='insider'?1:0)}`);
                       newSchedule[day][shiftKey].push({ name: emp.name, roles: emp.roles, isCustom: false });
                       requiredRoles[assignedRole]--;
                       totalRequired--;
                       currentWeekHours[emp.name] = hoursAfterShift;
                       assignedInPass1.add(emp.name);
                   }
               }
           });
  
          // --- Assignment Pass 2: OVER hour goal (if needed) ---
           if (totalRequired > 0) {
               console.log(`    Starting Pass 2 (Over Goal) for ${shiftKey}, Needs M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}`);
               potentialEmployees.forEach(emp => {
                   if (totalRequired <= 0) return;
                   if (assignedInPass1.has(emp.name)) return;
  
                   const empCurrentHours = currentWeekHours[emp.name] || 0;
                   const hoursAfterShift = empCurrentHours + shiftHourDuration;
  
                   const alreadyAssignedThisShift = newSchedule[day]?.[shiftKey]?.some(e => e.name === emp.name);
                   let alreadyAssignedTodayElsewhere = false;
                   for (const sk in newSchedule[day]) {
                      if (sk !== shiftKey && newSchedule[day][sk]?.some(e => e.name === emp.name)) {
                          alreadyAssignedTodayElsewhere = true;
                          break;
                      }
                   }
  
                   // MODIFIED Check: Consider BOTH standard availability and relevant custom times
                   const isAvailable = emp.availability?.[day]?.[shiftType] || emp.customTimes?.[day]?.shiftType === shiftType;

                   if (alreadyAssignedThisShift || alreadyAssignedTodayElsewhere || !isAvailable) {
                       return; // Skip
                   }
  
                   let assignedRole = null;
                   if (emp.roles.manager && requiredRoles.manager > 0) assignedRole = 'manager';
                   else if (emp.roles.driver && requiredRoles.driver > 0) assignedRole = 'driver';
                   else if (emp.roles.insider && requiredRoles.insider > 0) assignedRole = 'insider';
  
                   if (assignedRole) {
                       console.log(`     ASSIGN (P2): ${emp.name} as ${assignedRole} to ${shiftKey}. Hours: ${empCurrentHours.toFixed(1)} -> ${hoursAfterShift.toFixed(1)} / ${emp.hourGoal}. Needs left: M:${requiredRoles.manager- (assignedRole==='manager'?1:0)}, D:${requiredRoles.driver - (assignedRole==='driver'?1:0)}, I:${requiredRoles.insider- (assignedRole==='insider'?1:0)}`);
                       newSchedule[day][shiftKey].push({ name: emp.name, roles: emp.roles, isCustom: false });
                       requiredRoles[assignedRole]--;
                       totalRequired--;
                       currentWeekHours[emp.name] = hoursAfterShift;
                   }
               });
           }
  
          // Log final state for the shift
          if (totalRequired > 0) {
            console.log(`    --> Unfilled Requirements for ${shiftKey}: M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}`);
          } else {
             const finalCount = newSchedule[day]?.[shiftKey]?.length || 0;
             console.log(`    --> All minimum requirements filled for ${shiftKey}. Final count: ${finalCount}`);
          }
      }); // End of prioritized shift loop
    }); // End of days loop
  
    console.log("--- Schedule Generation Complete ---");
    setSchedule(newSchedule);
  }; // End of generateSchedule

  // Helper to get the index of a day
  const getDayIndex = (dayName) => days.indexOf(dayName);

  // Helper to get the previous day's name, handling wrap-around
  const getPreviousDay = (dayName) => {
    const index = getDayIndex(dayName);
    const prevIndex = (index - 1 + days.length) % days.length;
    return days[prevIndex];
  };

  // Helper to check if assigning an Opening shift creates a "clopen" conflict
  const wouldCreateClopeningConflict = (employeeName, targetDay, currentSchedule) => {
    const previousDay = getPreviousDay(targetDay);
    const previousDayClosingShiftKey = `${previousDay}-Closing`;
    const previousDayAssignments = currentSchedule[previousDay]?.[previousDayClosingShiftKey] || [];

    return previousDayAssignments.some(assignment => assignment.name === employeeName);
  };

  const formatCustomTime = (start, end) => {
    if (!start || !end) return "";
    const formatTime = (time) => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes}${ampm}`;
    };
    return `${formatTime(start)}-${formatTime(end)}`;
  };

  const addOrUpdateEmployee = () => {
    if (!name.trim()) return;

    const newEmployee = {
      name: name.trim(),
      availability: JSON.parse(JSON.stringify(availability)),
      customTimes: JSON.parse(JSON.stringify(customTimes)),
      roles: { ...roles },
      hourGoal: parseInt(hourGoal),
    };

    const updatedList = [...employees];
    if (editingIndex !== null) {
      updatedList[editingIndex] = newEmployee;
    } else {
      updatedList.push(newEmployee);
    }

    setEmployees(updatedList);
    setName("");
    setAvailability({});
    setCustomTimes({});
    setRoles({ manager: false, insider: false, driver: false });
    setHourGoal(40);
    setEditingIndex(null);
  };

  const deleteEmployee = (name) => {
    if (window.confirm(`Delete ${name}?`)) {
      setEmployees(employees.filter((e) => e.name !== name));
    }
  };

  const editEmployee = (index) => {
    const emp = employees[index];
    setName(emp.name);
    setAvailability(emp.availability);
    setCustomTimes(emp.customTimes || {});
    setRoles(emp.roles);
    setHourGoal(emp.hourGoal);
    setEditingIndex(index);
  };

  const exportToExcel = () => {
    const header = ["Employee", ...days, "Total Hours"];
    const data = employees.map((emp) => {
      const row = { Employee: emp.name };
      days.forEach(day => {
        let dayShifts = [];
        // Check regular shifts
        Object.entries(schedule[day] || {}).forEach(([shiftKey, assignedEmployees]) => {
          if (Array.isArray(assignedEmployees)) {
            assignedEmployees.forEach(assignment => {
              if (assignment.name === emp.name) {
                if (assignment.isCustom && assignment.customDisplay) {
                  dayShifts.push(`${assignment.customDisplay} (Custom)`);
                } else {
                   const shiftType = shiftKey.split('-')[1];
                   dayShifts.push(shifts[shiftType] || shiftType); // Use defined time string or just the type
                }
              }
            });
          }
        });
         // Add custom times not tied to shifts (though less common now)
        const customTime = emp.customTimes?.[day];
         if (customTime?.start && customTime?.end && !customTime.shiftType) {
             dayShifts.push(`${formatCustomTime(customTime.start, customTime.end)} (Custom)`);
         }

        row[day] = dayShifts.join(", "); // Join multiple shifts if assigned
      });
      // Use the corrected function to get total hours for the week
      row["Total Hours"] = getTotalHoursForEmployee(emp.name);
      return row;
    });

    const ws = utils.json_to_sheet(data, { header: header }); // Use header option
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Schedule");
    writeFile(wb, "schedule.xlsx");
  };

  // Function to get names of employees available for a specific shift type on a day
  const getAvailableForShift = (day, shiftType) => {
    return employees
      .filter(emp => emp.availability?.[day]?.[shiftType]) // Check the standard availability flag
      .map(emp => emp.name)
      .join(", ") || "None"; // Return comma-separated names or "None"
  };
  // Make sure this function is *inside* the main App component,
  // for example, before this next function:
  // const getAvailableEmployees = (day, shiftKey, role) => { ...

  const isDayCovered = (day) => {
    const daySchedule = schedule[day] || {};
    const reasons = [];
    const assignedCounts = { // Track counts for the whole day
      Opening: { manager: 0, driver: 0, insider: 0 },
      Midshift: { manager: 0, driver: 0, insider: 0 },
      Closing: { manager: 0, driver: 0, insider: 0 }
    };

    // Iterate through the actual scheduled shifts for the day
    Object.entries(daySchedule).forEach(([shiftKey, assignedEmployees]) => {
      const shiftType = shiftKey.split('-')[1]; // Opening, Midshift, Closing
      if (assignedCounts[shiftType] && Array.isArray(assignedEmployees)) {
        assignedEmployees.forEach(emp => {
           if (emp.roles?.manager) assignedCounts[shiftType].manager++;
           if (emp.roles?.driver) assignedCounts[shiftType].driver++;
           if (emp.roles?.insider) assignedCounts[shiftType].insider++;
        });
      }
    });

    // Now compare assigned counts with requirements for each shift
    for (const shift of ['Opening', 'Midshift', 'Closing']) {
        const required = {
            manager: roleRequirements[day]?.manager?.[shift] || 0,
            driver: roleRequirements[day]?.driver?.[shift] || 0,
            insider: roleRequirements[day]?.insider?.[shift] || 0,
        };
        const assigned = assignedCounts[shift];

        if (assigned.manager < required.manager) {
            reasons.push(`Missing ${required.manager - assigned.manager} Manager(s) for ${shift}`);
        }
        // Only check Midshift for manager if requirement > 0 (since it's often 0)
        if (shift === 'Midshift' && required.manager > 0 && assigned.manager < required.manager) {
           reasons.push(`Missing ${required.manager - assigned.manager} Manager(s) for ${shift}`);
        }

        if (assigned.driver < required.driver) {
            reasons.push(`Missing ${required.driver - assigned.driver} Driver(s) for ${shift}`);
        }
        if (assigned.insider < required.insider) {
            reasons.push(`Missing ${required.insider - assigned.insider} Insider(s) for ${shift}`);
        }
     }
    return {
      covered: reasons.length === 0,
      reasons: reasons // Return the detailed reasons
    };
  };

  // Modified: Gets available employees for a specific day, shift type, and role
  // Modified: Gets available employees for a specific day, shift type, and role
  const getAvailableEmployees = (day, shiftType, role) => {
    return employees
      .filter(emp =>
        emp.roles?.[role] && // Check if employee has the specified role
        // Check BOTH standard availability OR custom time linked to this shift type
        (emp.availability?.[day]?.[shiftType] || emp.customTimes?.[day]?.shiftType === shiftType)
      )
      .map(emp => emp.name)
      .join(", ") || "None";
  };

  // Update role requirement
  const updateRoleRequirement = (day, role, shift, value) => {
    setRoleRequirements(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [role]: {
          ...prev[day][role],
          [shift]: value
        }
      }
    }));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto dark:bg-gray-900 dark:text-white">
      <h1 className="text-2xl font-bold mb-4">Smart Shift Scheduler</h1>

      {/* Dark Mode Toggle */}
      <div className="mb-4">
        <button
          onClick={toggleDarkMode}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded"
        >
          Toggle Dark Mode
        </button>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow mb-6">
        <input
          className="border p-2 mr-4 text-black"
          value={name}
          placeholder="Employee name"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mb-2 mt-2">
          <strong>Availability:</strong>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2">
            {days.map((day) => (
              <div key={day} className="border p-2 rounded">
                <div className="font-semibold mb-2">{day}</div>
                {Object.entries(shifts).map(([shiftKey, time]) => (
                  <div key={shiftKey} className="mb-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={availability[day]?.[shiftKey] || false}
                        onChange={() => toggleAvailability(day, shiftKey)}
                      />
                      {shiftKey}
                    </label>
                    <div className="text-sm text-gray-500 ml-5">({time})</div>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t">
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={!!customTimes[day]?.start}
                      onChange={() => toggleCustomTime(day)}
                    />
                    <span className="font-medium">Custom</span>
                  </div>
                  {customTimes[day]?.start !== undefined && (
                    <div className="ml-5">
                      <div className="flex gap-2 mb-2">
                        <input
                          type="time"
                          value={customTimes[day]?.start || ""}
                          onChange={(e) => updateCustomTime(day, "start", e.target.value)}
                          className="border p-1 text-black"
                        />
                        <span>to</span>
                        <input
                          type="time"
                          value={customTimes[day]?.end || ""}
                          onChange={(e) => updateCustomTime(day, "end", e.target.value)}
                          className="border p-1 text-black"
                        />
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`shiftType-${day}`}
                            checked={customTimes[day]?.shiftType === "Opening"}
                            onChange={() => updateCustomShiftType(day, "Opening")}
                          />
                          Opening
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`shiftType-${day}`}
                            checked={customTimes[day]?.shiftType === "Midshift"}
                            onChange={() => updateCustomShiftType(day, "Midshift")}
                          />
                          Midshift
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`shiftType-${day}`}
                            checked={customTimes[day]?.shiftType === "Closing"}
                            onChange={() => updateCustomShiftType(day, "Closing")}
                          />
                          Closing
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <strong>Roles:</strong>
          <div className="flex gap-4 mt-1">
            {["manager", "insider", "driver"].map((role) => (
              <label key={role} className="flex items-center gap-1 capitalize">
                <input
                  type="checkbox"
                  checked={!!roles[role]}
                  onChange={(e) =>
                    setRoles({ ...roles, [role]: e.target.checked })
                  }
                />
                {role}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-2 mt-2">
          <strong>Hour Goal:</strong>
          <select
            value={hourGoal}
            onChange={(e) => setHourGoal(e.target.value)}
            className="border p-2 ml-2 text-black"
          >
            {hourGoalOptions.map((val) => (
              <option key={val} value={val}>
                {val + " hrs"}
              </option>
            ))}
          </select>
        </div>

        <button
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded"
          onClick={addOrUpdateEmployee}
        >
          {editingIndex !== null ? "Update Employee" : "Add Employee"}
        </button>
      </div>

      {/* Daily Role Requirements */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Daily Role Requirements</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead>
              <tr>
                <th className="border p-2 font-bold">Day</th>
                <th colSpan="2" className="border p-2 font-bold text-center">Managers</th>
                <th colSpan="3" className="border p-2 font-bold text-center">Drivers</th>
                <th colSpan="3" className="border p-2 font-bold text-center">Insiders</th>
              </tr>
              <tr>
                <th className="border p-2"></th>
                <th className="border p-2 font-bold">Opening</th>
                <th className="border p-2 font-bold">Closing</th>
                <th className="border p-2 font-bold">Opening</th>
                <th className="border p-2 font-bold">Midshift</th>
                <th className="border p-2 font-bold">Closing</th>
                <th className="border p-2 font-bold">Opening</th>
                <th className="border p-2 font-bold">Midshift</th>
                <th className="border p-2 font-bold">Closing</th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day}>
                  <td className="border p-2 font-bold">{day}</td>
                  {/* Manager Requirements */}
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].manager.Opening}
                      onChange={(e) => updateRoleRequirement(day, 'manager', 'Opening', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].manager.Closing}
                      onChange={(e) => updateRoleRequirement(day, 'manager', 'Closing', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  {/* Driver Requirements */}
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].driver.Opening}
                      onChange={(e) => updateRoleRequirement(day, 'driver', 'Opening', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].driver.Midshift}
                      onChange={(e) => updateRoleRequirement(day, 'driver', 'Midshift', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].driver.Closing}
                      onChange={(e) => updateRoleRequirement(day, 'driver', 'Closing', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  {/* Insider Requirements */}
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].insider.Opening}
                      onChange={(e) => updateRoleRequirement(day, 'insider', 'Opening', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].insider.Midshift}
                      onChange={(e) => updateRoleRequirement(day, 'insider', 'Midshift', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      min="0"
                      value={roleRequirements[day].insider.Closing}
                      onChange={(e) => updateRoleRequirement(day, 'insider', 'Closing', parseInt(e.target.value))}
                      className="w-16 border p-1 text-center text-black"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="overflow-auto">
        <table className="table-auto border-collapse w-full mb-4">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700">Employee</th>
              {days.map((day) => {
                // Calculate availability strings for the detailed tooltip
                const avail = {
                  Opening: {
                    manager: getAvailableEmployees(day, 'Opening', 'manager'),
                    insider: getAvailableEmployees(day, 'Opening', 'insider'),
                    driver: getAvailableEmployees(day, 'Opening', 'driver'),
                  },
                  Midshift: {
                    // manager: getAvailableEmployees(day, 'Midshift', 'manager'), // Midshift Managers often not required/available
                    insider: getAvailableEmployees(day, 'Midshift', 'insider'),
                    driver: getAvailableEmployees(day, 'Midshift', 'driver'),
                  },
                  Closing: {
                    manager: getAvailableEmployees(day, 'Closing', 'manager'),
                    insider: getAvailableEmployees(day, 'Closing', 'insider'),
                    driver: getAvailableEmployees(day, 'Closing', 'driver'),
                  }
                };

                return (
                  <th key={day} className="border p-2 bg-gray-100 dark:bg-gray-700 relative group"> {/* Added relative group */}
                    {day}
                    {/* Tooltip Div */}
                    <div className="absolute hidden group-hover:block z-20 w-72 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-black dark:text-white text-xs rounded shadow-lg left-0 mt-1 text-left font-normal whitespace-normal">
                      <div className="font-bold mb-2 text-center border-b pb-1">Available ({day})</div>

                      {/* Opening Section */}
                      <div className="mb-2">
                        <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">Opening:</div>
                        <div className="ml-2">M: {avail.Opening.manager}</div>
                        <div className="ml-2">I: {avail.Opening.insider}</div>
                        <div className="ml-2">D: {avail.Opening.driver}</div>
                      </div>

                      {/* Midshift Section */}
                      <div className="mb-2">
                        <div className="font-semibold text-green-600 dark:text-green-400 mb-1">Midshift:</div>
                        {/* <div className="ml-2">M: {avail.Midshift.manager}</div> */}
                        <div className="ml-2">I: {avail.Midshift.insider}</div>
                        <div className="ml-2">D: {avail.Midshift.driver}</div>
                      </div>

                      {/* Closing Section */}
                      <div>
                        <div className="font-semibold text-red-600 dark:text-red-400 mb-1">Closing:</div>
                        <div className="ml-2">M: {avail.Closing.manager}</div>
                        <div className="ml-2">I: {avail.Closing.insider}</div>
                        <div className="ml-2">D: {avail.Closing.driver}</div>
                      </div>
                       {/* Note: This checks standard availability checkboxes, not custom time definitions */}
                    </div>
                  </th>
                );
              })}
              <th className="border p-2 bg-gray-100 dark:bg-gray-700">Total Hours</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {["manager", "insider", "driver"].map((roleKey) => {
              const group = employees.filter((e) => e.roles?.[roleKey]);
              if (group.length === 0) return null;

              return (
                <React.Fragment key={roleKey}>
                  <tr>
                    <td colSpan={days.length + 3} className="bg-gray-200 dark:bg-gray-600 font-bold p-2 text-left">
                      {roleKey.charAt(0).toUpperCase() + roleKey.slice(1)}
                    </td>
                  </tr>
                  {group.map((emp, idx) => (
                    <tr key={emp.name}>
                      <td className="border p-2">{emp.name}</td>
                      {days.map((day) => {
                        const dayAssignments = schedule[day] || {};
                        let cellContent = "";
                        let cellBgColor = "";
                        let assigned = false;

                        // Find assignments for this employee on this day
                        Object.entries(dayAssignments).forEach(([shiftKey, employeesInShift]) => {
                            if (Array.isArray(employeesInShift)) {
                                const assignment = employeesInShift.find(a => a.name === emp.name);
                                if (assignment) {
                                    assigned = true;
                                    const shiftType = shiftKey.split('-')[1];
                                    const display = assignment.isCustom && assignment.customDisplay
                                        ? assignment.customDisplay // Show custom time range
                                        : shifts[shiftType] || shiftType; // Show standard shift time

                                    cellContent = cellContent ? `${cellContent}, ${display}` : display; // Append if multiple shifts (unlikely with current logic)

                                    // Apply background color based on the first shift found (or custom shift type)
                                    if (!cellBgColor) {
                                        const colorShiftType = assignment.isCustom
                                            ? emp.customTimes?.[day]?.shiftType // Get original type for color
                                            : shiftType;
                                        cellBgColor = shiftColors[colorShiftType] || "";
                                    }
                                }
                            }
                        });

                        // Tooltip logic remains similar, but maybe less critical if assignments are correct
                        const tooltipAvailable = getAvailableEmployees(day, 'Opening', roleKey) || "None"; // Example, adjust as needed


                        return (
                          <td
                            key={day}
                            className={`border p-2 text-sm text-center relative group ${cellBgColor}`}
                          >
                            {cellContent || ""} {/* Display assigned shifts or empty */}
                            {/* Tooltip can be simplified or adjusted based on needs */}
                            {/* {!assigned && ( // Show tooltip only if cell is empty?
                                <div className="absolute hidden group-hover:block z-10 w-64 p-2 bg-white text-black text-xs rounded shadow-lg">
                                    <div className="font-bold mb-1">Available:</div>
                                    <div>{tooltipAvailable}</div>
                                </div>
                            )} */}
                          </td>
                        );
                      })}
                      <td className="border p-2 text-center">{getTotalHoursForEmployee(emp.name)} hrs</td>
                      <td className="border p-2 text-center space-x-2">
                        <button
                          className="text-blue-500 hover:text-blue-700"
                          onClick={() => editEmployee(employees.indexOf(emp))}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteEmployee(emp.name)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {/* Coverage Row */}
            <tr>
              <td className="border p-2 font-bold">Covered</td>
              {days.map((day) => {
                const coverage = isDayCovered(day);
                return (
                  <td 
                    key={day} 
                    className="border p-2 text-center relative group"
                  >
                    {coverage.covered ? "Yes" : (
                      <span className="text-red-500 cursor-help">
                        No
                        <div className="absolute hidden group-hover:block z-10 w-64 p-2 bg-white text-black text-xs rounded shadow-lg">
                          <div className="font-bold mb-1">Missing Requirements:</div>
                          <ul className="list-disc list-inside">
                            {coverage.reasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="border p-2" colSpan="2"></td>
            </tr>

            {/* Daily Total Hours Row */}
            <tr>
              <td className="border p-2 font-bold">Daily Hours</td>
              {days.map((day) => {
                const totalHours = getDailyTotalHours(day);
                return (
                  <td key={day} className="border p-2 text-center">
                    {totalHours} hrs
                  </td>
                );
              })}
              <td className="border p-2 text-center font-bold">
                {days.reduce((total, day) => total + getDailyTotalHours(day), 0)} hrs
              </td>
              <td className="border p-2"></td>
            </tr>

            {/* Shift Count Rows */}
            <tr>
              <td className="border p-2 font-bold">Openers</td>
              {days.map((day) => {
                const openerCount = Object.entries(schedule[day] || {})
                  .filter(([shift]) => shift.includes('Opening'))
                  .reduce((total, [_, employees]) => total + (Array.isArray(employees) ? employees.length : 0), 0);
                return (
                  <td key={day} className="border p-2 text-center">
                    {openerCount}
                  </td>
                );
              })}
              <td className="border p-2" colSpan="2"></td>
            </tr>

            <tr>
              <td className="border p-2 font-bold">Midshift</td>
              {days.map((day) => {
                const midshiftCount = Object.entries(schedule[day] || {})
                  .filter(([shift]) => shift.includes('Midshift'))
                  .reduce((total, [_, employees]) => total + (Array.isArray(employees) ? employees.length : 0), 0);
                return (
                  <td key={day} className="border p-2 text-center">
                    {midshiftCount}
                  </td>
                );
              })}
              <td className="border p-2" colSpan="2"></td>
            </tr>

            <tr>
              <td className="border p-2 font-bold">Closers</td>
              {days.map((day) => {
                const closerCount = Object.entries(schedule[day] || {})
                  .filter(([shift]) => shift.includes('Closing'))
                  .reduce((total, [_, employees]) => total + (Array.isArray(employees) ? employees.length : 0), 0);
                return (
                  <td key={day} className="border p-2 text-center">
                    {closerCount}
                  </td>
                );
              })}
              <td className="border p-2" colSpan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-4">
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={exportToExcel}
        >
          Export to Excel
        </button>
        <button
          className="bg-red-600 text-white px-4 py-2 rounded"
          onClick={() => {
            if (window.confirm("Clear all employees?")) {
              setEmployees([]);
              localStorage.removeItem("employeeData");
            }
          }}
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
export default App;
