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
    const employeeObj = employees.find(e => e.name === empName);
    if (!employeeObj) return 0;
  
    let totalHours = 0;
    const daySchedule = currentSchedule[day] || {};
  
    // Count regular shift hours
    Object.entries(daySchedule).forEach(([shiftKey, assignedEmployees]) => {
      if (Array.isArray(assignedEmployees)) {
        const isAssigned = assignedEmployees.some(shift => shift.name === empName);
        if (isAssigned) {
          const shiftType = shiftKey.split('-')[1]; // e.g., "Opening" from "Monday-Opening"
          if (shiftDurations[shiftType]) {
            totalHours += shiftDurations[shiftType];
          }
        }
      }
    });
  
    // Only count custom hours for the specific day if they are NOT associated with a standard shift type
    // (Custom times associated with a shift type are handled during requirement calculation)
    const customTime = employeeObj.customTimes?.[day];
    if (customTime?.start && customTime?.end && !customTime.shiftType) {
      const start = new Date(`1970-01-01T${customTime.start}:00`);
      const end = new Date(`1970-01-01T${customTime.end}:00`);
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalHours += (end - start) / (1000 * 60 * 60); // Calculate hours from time strings
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
  const getDailyTotalHours = (day) => {
    let total = 0;
    // Add regular shift hours
    Object.entries(schedule[day] || {}).forEach(([shiftKey, shift]) => {
      if (shift) {
        const shiftType = shiftKey.split('-')[1];
        total += shiftDurations[shiftType];
      }
    });
    // Add custom time hours
    employees.forEach(emp => {
      const customTime = emp.customTimes?.[day];
      if (customTime?.start && customTime?.end) {
        const start = parseInt(customTime.start.split(':')[0]);
        const end = parseInt(customTime.end.split(':')[0]);
        total += end - start;
      }
    });
    return total;
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

    // --- Pre-assign custom times tied to specific shifts ---
    console.log("\n--- Phase 1: Pre-assigning Custom Times ---");
    days.forEach(day => {
      currentEmployees.forEach(emp => {
        const customTime = emp.customTimes?.[day];
        if (customTime?.start && customTime?.end && customTime.shiftType) {
          const shiftKey = `${day}-${customTime.shiftType}`;
          const start = new Date(`1970-01-01T${customTime.start}:00`);
          const end = new Date(`1970-01-01T${customTime.end}:00`);
          let customHours = 0;
           if (!isNaN(start) && !isNaN(end) && end > start) {
              customHours = (end - start) / (1000 * 60 * 60);
           } else {
              console.warn(`[Custom Time] Invalid time for ${emp.name} on ${day}: ${customTime.start}-${customTime.end}`);
           }

          if (newSchedule[day]?.[shiftKey]) {
             const hoursAfterCustom = currentWeekHours[emp.name] + customHours;
             // Prioritize if under goal OR if they currently have 0 hours (guaranteeing at least one shift if possible)
             if (hoursAfterCustom <= emp.hourGoal || currentWeekHours[emp.name] === 0) {
               console.log(` [Custom Time] Assigning ${emp.name} to ${shiftKey} (${customTime.start}-${customTime.end}, ${customHours.toFixed(1)} hrs). Hours: ${currentWeekHours[emp.name].toFixed(1)} -> ${hoursAfterCustom.toFixed(1)} / ${emp.hourGoal}`);
               // Log array state *before* push
               // console.log(`   DEBUG: State of ${shiftKey} before push for ${emp.name}:`, JSON.stringify(newSchedule[day][shiftKey]));
               newSchedule[day][shiftKey].push({
                  name: emp.name,
                  roles: emp.roles,
                  isCustom: true,
                  customDisplay: formatCustomTime(customTime.start, customTime.end)
               });
               currentWeekHours[emp.name] = hoursAfterCustom;
             } else {
               console.log(` [Custom Time] Skipping ${emp.name} for ${shiftKey} (Custom) - exceeds goal. Hours: ${currentWeekHours[emp.name].toFixed(1)} + ${customHours.toFixed(1)} > ${emp.hourGoal}`);
             }
          } else {
             console.warn(`[Custom Time] Invalid shiftKey generated: ${shiftKey} for ${emp.name} on ${day}`);
          }
        }
      });
    });


    // --- Assign regular shifts ---
    console.log("\n--- Phase 2: Assigning Regular Shifts ---");
    days.forEach(day => {
      console.log(`\nProcessing ${day}:`);

      ['Opening', 'Midshift', 'Closing'].forEach(shift => {
        const shiftKey = `${day}-${shift}`;
        console.log(` -> Processing Shift: ${shiftKey}`);
        const shiftHourDuration = shiftDurations[shift];

        // Calculate requirements *before* considering custom fills
        const baseRequirements = {
          manager: roleRequirements[day]?.manager?.[shift] || 0,
          driver: roleRequirements[day]?.driver?.[shift] || 0,
          insider: roleRequirements[day]?.insider?.[shift] || 0
        };
        console.log(`    Base Requirements: M:${baseRequirements.manager}, D:${baseRequirements.driver}, I:${baseRequirements.insider}`);

        // Calculate roles already filled by custom assignments for this specific shift
        const currentAssignments = newSchedule[day][shiftKey];
        const filledRolesByCustom = { manager: 0, driver: 0, insider: 0 };
        currentAssignments.forEach(assignment => {
            // Only count custom assignments here for requirement calculation
            if (assignment.isCustom) {
                if (assignment.roles.manager) filledRolesByCustom.manager++;
                if (assignment.roles.driver) filledRolesByCustom.driver++;
                if (assignment.roles.insider) filledRolesByCustom.insider++;
            }
        });
         console.log(`    Filled by Custom: M:${filledRolesByCustom.manager}, D:${filledRolesByCustom.driver}, I:${filledRolesByCustom.insider}`);


        // Calculate remaining needs for the assignment passes
        const requiredRoles = {
            manager: Math.max(0, baseRequirements.manager - filledRolesByCustom.manager),
            driver: Math.max(0, baseRequirements.driver - filledRolesByCustom.driver),
            insider: Math.max(0, baseRequirements.insider - filledRolesByCustom.insider),
        };
         console.log(`    Remaining Needs for Passes: M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}`);


        let totalRequired = requiredRoles.manager + requiredRoles.driver + requiredRoles.insider;

        if (totalRequired <= 0 && currentAssignments.length >= (baseRequirements.manager + baseRequirements.driver + baseRequirements.insider)) {
          console.log(`    Shift requirements met or exceeded by custom times. Skipping assignment passes.`);
          return; // Skip assignment passes if needs met
        }
        if (totalRequired <=0 ) {
           console.log(`    All *minimum* role requirements met by custom times, but potentially fewer people than base requirement. Proceeding.`);
        }


        // Sort employees by current hours *tracked during this run* (ascending)
        const potentialEmployees = [...currentEmployees].sort((a, b) => {
          const hoursA = currentWeekHours[a.name] || 0;
          const hoursB = currentWeekHours[b.name] || 0;
          if (hoursA !== hoursB) {
              return hoursA - hoursB;
          }
          return 0; // Keep stable if hours are equal
        });
        // console.log(`    Sorted Potential Employees (Top 5):`, potentialEmployees.slice(0, 5).map(e => `${e.name} (${(currentWeekHours[e.name] || 0).toFixed(1)}hrs)`));


        // --- Assignment Pass 1: Try to assign UNDER OR AT hour goal ---
        console.log(`    Starting Pass 1 (Under/At Goal)`);
        let assignedInPass1 = new Set();

         potentialEmployees.forEach(emp => {
             if (totalRequired <= 0) return; // Stop if all roles filled

             const empCurrentHours = currentWeekHours[emp.name] || 0;
             const hoursAfterShift = empCurrentHours + shiftHourDuration;

             // Check if already assigned to this specific shift slot
             const alreadyAssignedThisShift = newSchedule[day][shiftKey].some(e => e.name === emp.name);
             // Check if assigned *anywhere* else today
             let alreadyAssignedTodayElsewhere = false;
             for (const sk in newSchedule[day]) {
                 if (sk !== shiftKey && newSchedule[day][sk].some(e => e.name === emp.name)) {
                     alreadyAssignedTodayElsewhere = true;
                     break;
                 }
             }

             if (alreadyAssignedThisShift) {
                 // console.log(`     SKIP (P1): ${emp.name} - Already assigned to ${shiftKey}`);
                 return;
             }
              if (alreadyAssignedTodayElsewhere) {
                 // console.log(`     SKIP (P1): ${emp.name} - Already assigned elsewhere on ${day}`);
                  return;
              }
             if (!emp.availability?.[day]?.[shift]) {
                 // console.log(`     SKIP (P1): ${emp.name} - Not available for ${shiftKey}`);
                 return;
             }

             // Try to assign if UNDER OR EQUAL to goal
             if (hoursAfterShift <= emp.hourGoal) {
                 let assignedRole = null;
                 // ** Assign role only if that specific role is still needed **
                 if (emp.roles.manager && requiredRoles.manager > 0) assignedRole = 'manager';
                 else if (emp.roles.driver && requiredRoles.driver > 0) assignedRole = 'driver';
                 else if (emp.roles.insider && requiredRoles.insider > 0) assignedRole = 'insider';

                 if (assignedRole) {
                     console.log(`     ASSIGN (P1): ${emp.name} as ${assignedRole} to ${shiftKey}. Hours: ${empCurrentHours.toFixed(1)} -> ${hoursAfterShift.toFixed(1)} / ${emp.hourGoal}. Needs left: M:${requiredRoles.manager- (assignedRole==='manager'?1:0)}, D:${requiredRoles.driver - (assignedRole==='driver'?1:0)}, I:${requiredRoles.insider- (assignedRole==='insider'?1:0)}`);
                     // Log array state *before* push
                     // console.log(`       DEBUG: State of ${shiftKey} before push for ${emp.name}:`, JSON.stringify(newSchedule[day][shiftKey]));
                     newSchedule[day][shiftKey].push({ name: emp.name, roles: emp.roles });
                     requiredRoles[assignedRole]--;
                     totalRequired--;
                     currentWeekHours[emp.name] = hoursAfterShift;
                     assignedInPass1.add(emp.name);
                 } else {
                   // Log why assignment didn't happen even if under goal
                   // Check if roles match any need first
                   const canFillAnyRole = (emp.roles.manager && requiredRoles.manager > 0) || (emp.roles.driver && requiredRoles.driver > 0) || (emp.roles.insider && requiredRoles.insider > 0);
                   if (!canFillAnyRole) {
                     // console.log(`     SKIP (P1): ${emp.name} - Under goal, but no matching *needed* role for ${shiftKey}. (Needs M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}) Roles: ${JSON.stringify(emp.roles)}`);
                   } else {
                     // This case shouldn't be reached if the logic above is correct
                     // console.log(`     SKIP (P1): ${emp.name} - Under goal, role needed, but not assigned (Logic Error?).`);
                   }
                 }
             } else {
                // console.log(`     SKIP (P1): ${emp.name} - Exceeds goal (${hoursAfterShift.toFixed(1)} / ${emp.hourGoal})`);
             }
         });


        // --- Assignment Pass 2: If requirements still unmet, assign OVER hour goal ---
         if (totalRequired > 0) {
             console.log(`    Starting Pass 2 (Over Goal, Needs M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider})`);
             potentialEmployees.forEach(emp => {
                 if (totalRequired <= 0) return; // Stop if filled
                 if (assignedInPass1.has(emp.name)) return; // Skip if already assigned in Pass 1

                 const empCurrentHours = currentWeekHours[emp.name] || 0;
                 const hoursAfterShift = empCurrentHours + shiftHourDuration;

                  // Check if already assigned to this specific shift slot
                 const alreadyAssignedThisShift = newSchedule[day][shiftKey].some(e => e.name === emp.name);
                  // Check if assigned *anywhere* else today
                 let alreadyAssignedTodayElsewhere = false;
                  for (const sk in newSchedule[day]) {
                     if (sk !== shiftKey && newSchedule[day][sk].some(e => e.name === emp.name)) {
                         alreadyAssignedTodayElsewhere = true;
                         break;
                     }
                 }

                 if (alreadyAssignedThisShift) {
                    // console.log(`     SKIP (P2): ${emp.name} - Already assigned to ${shiftKey}`);
                     return;
                 }
                  if (alreadyAssignedTodayElsewhere) {
                     // console.log(`     SKIP (P2): ${emp.name} - Already assigned elsewhere on ${day}`);
                      return;
                  }
                  if (!emp.availability?.[day]?.[shift]) {
                     // console.log(`     SKIP (P2): ${emp.name} - Not available for ${shiftKey}`);
                     return;
                 }

                 // Assign regardless of goal if role needed
                 let assignedRole = null;
                  // ** Assign role only if that specific role is still needed **
                 if (emp.roles.manager && requiredRoles.manager > 0) assignedRole = 'manager';
                 else if (emp.roles.driver && requiredRoles.driver > 0) assignedRole = 'driver';
                 else if (emp.roles.insider && requiredRoles.insider > 0) assignedRole = 'insider';

                 if (assignedRole) {
                     console.log(`     ASSIGN (P2): ${emp.name} as ${assignedRole} to ${shiftKey}. Hours: ${empCurrentHours.toFixed(1)} -> ${hoursAfterShift.toFixed(1)} / ${emp.hourGoal}. Needs left: M:${requiredRoles.manager- (assignedRole==='manager'?1:0)}, D:${requiredRoles.driver - (assignedRole==='driver'?1:0)}, I:${requiredRoles.insider- (assignedRole==='insider'?1:0)}`);
                      // Log array state *before* push
                     // console.log(`       DEBUG: State of ${shiftKey} before push for ${emp.name}:`, JSON.stringify(newSchedule[day][shiftKey]));
                     newSchedule[day][shiftKey].push({ name: emp.name, roles: emp.roles });
                     requiredRoles[assignedRole]--;
                     totalRequired--;
                     currentWeekHours[emp.name] = hoursAfterShift;
                 } else {
                    // console.log(`     SKIP (P2): ${emp.name} - No matching *needed* role for ${shiftKey}. (Needs M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}) Roles: ${JSON.stringify(emp.roles)}`);
                 }
             });
         }


        // Log final state for the shift
        if (totalRequired > 0) {
          console.log(`    --> Unfilled Requirements for ${shiftKey}: M:${requiredRoles.manager}, D:${requiredRoles.driver}, I:${requiredRoles.insider}`);
        } else {
           console.log(`    --> All minimum requirements filled for ${shiftKey}. Final count: ${newSchedule[day][shiftKey].length}`);
        }
      });
    });

    console.log("--- Schedule Generation Complete ---");
    // console.log("Final Schedule Object:", JSON.stringify(newSchedule, null, 2)); // Optional: Log full schedule object
    setSchedule(newSchedule);
    // No debug log state to set anymore
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


    // Specific legacy checks (can potentially be removed if requirements table is source of truth)
    // Kept for now to match original intent, but check against requirements is better
    // if (assignedCounts.Opening.manager === 0 && roleRequirements[day]?.manager?.Opening > 0) reasons.push("Missing Opening Manager");
    // if (assignedCounts.Closing.manager === 0 && roleRequirements[day]?.manager?.Closing > 0) reasons.push("Missing Closing Manager");
    // if (assignedCounts.Opening.driver === 0 && roleRequirements[day]?.driver?.Opening > 0) reasons.push("Missing Opening Driver");
    // if (assignedCounts.Midshift.driver === 0 && roleRequirements[day]?.driver?.Midshift > 0) reasons.push("Missing Midshift Driver");
    // if (assignedCounts.Closing.driver === 0 && roleRequirements[day]?.driver?.Closing > 0) reasons.push("Missing Closing Driver");
    // if (assignedCounts.Opening.insider === 0 && roleRequirements[day]?.insider?.Opening > 0) reasons.push("Missing Opening Insider");
    // if (assignedCounts.Midshift.insider === 0 && roleRequirements[day]?.insider?.Midshift > 0) reasons.push("Missing Midshift Insider");


    return {
      covered: reasons.length === 0,
      reasons: reasons // Return the detailed reasons
    };
  };

  const getAvailableEmployees = (day, shiftKey, role) => {
    return employees
      .filter(emp => emp.roles?.[role] && emp.availability?.[day]?.[shiftKey])
      .map(emp => emp.name)
      .join(", ");
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
              {days.map((day) => (
                <th key={day} className="border p-2 bg-gray-100 dark:bg-gray-700">{day}</th>
              ))}
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
                        const assignedShifts = Object.entries(schedule[day] || {}).filter(
                          ([shiftKey, val]) => Array.isArray(val) && val.some(e => e.name === emp.name)
                        );
                        const customTime = emp.customTimes?.[day];
                        const shiftType = customTime?.shiftType;
                        const customTimeDisplay = formatCustomTime(customTime?.start, customTime?.end);
                        
                        const shiftDisplay = assignedShifts.length > 0 ? 
                          assignedShifts
                            .map(([shiftKey, employees]) => 
                              employees.filter(e => e.name === emp.name)
                                .map(() => shifts[shiftKey.split('-')[1]])
                            )
                            .flat()
                            .join(', ') : 
                          customTimeDisplay;
                        
                        return (
                          <td 
                            key={day} 
                            className={`border p-2 text-sm text-center relative group ${
                              assignedShifts.length > 0 ? shiftColors[assignedShifts[0][0].split('-')[1]] : 
                              customTime?.start && customTime?.end ? shiftColors[shiftType] : ""
                            }`}
                          >
                            {shiftDisplay}
                            <div className="absolute hidden group-hover:block z-10 w-64 p-2 bg-white text-black text-xs rounded shadow-lg">
                              {assignedShifts.length === 0 ? (
                                <>
                                  <div className="font-bold mb-1">Available Openers:</div>
                                  <div className="mb-2">{getAvailableEmployees(day, 'Opening', roleKey) || "None"}</div>
                                  <div className="font-bold mb-1">Available Midshift:</div>
                                  <div className="mb-2">{getAvailableEmployees(day, 'Midshift', roleKey) || "None"}</div>
                                  <div className="font-bold mb-1">Available Closers:</div>
                                  <div>{getAvailableEmployees(day, 'Closing', roleKey) || "None"}</div>
                                </>
                              ) : (
                                <>
                                  <div className="font-bold mb-1">Available {assignedShifts[0][0].split('-')[1]}s:</div>
                                  <div>
                                    {getAvailableEmployees(day, assignedShifts[0][0].split('-')[1], roleKey) || "None"}
                                  </div>
                                </>
                              )}
                            </div>
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
