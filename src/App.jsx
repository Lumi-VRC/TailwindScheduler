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

const hourGoalOptions = [8, 16, 24, 32, 40, 999];

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState({});
  const [customTimes, setCustomTimes] = useState({});
  const [roles, setRoles] = useState({ manager: false, insider: false, driver: false });
  const [hourGoal, setHourGoal] = useState(40);
  const [dailyHourGoals, setDailyHourGoals] = useState(() => {
    const saved = localStorage.getItem("dailyHourGoals");
    return saved ? JSON.parse(saved) : {
      Monday: 40,
      Tuesday: 40,
      Wednesday: 40,
      Thursday: 40,
      Friday: 40,
      Saturday: 40,
      Sunday: 40
    };
  });
  const [schedule, setSchedule] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

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

  // Save daily hour goals when they change
  useEffect(() => {
    localStorage.setItem("dailyHourGoals", JSON.stringify(dailyHourGoals));
  }, [dailyHourGoals]);

  useEffect(() => {
    const saved = localStorage.getItem("employeeData");
    if (saved) {
      const parsed = JSON.parse(saved);
      setEmployees(parsed);
      generateSchedule(parsed);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("employeeData", JSON.stringify(employees));
    generateSchedule(employees);
  }, [employees]);

  // Add auto-refresh effect
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      generateSchedule(employees);
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, [employees]);

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

  const getDailyTotalHours = (day) => {
    let total = 0;
    // Add regular shift hours
    for (const [shiftKey, emp] of Object.entries(schedule[day] || {})) {
      if (emp) total += shiftDurations[shiftKey];
    }
    // Add custom time hours
    employees.forEach(emp => {
      const customTime = emp.customTimes?.[day];
      if (customTime?.start && customTime?.end) {
        const start = new Date(`2000-01-01T${customTime.start}`);
        const end = new Date(`2000-01-01T${customTime.end}`);
        const diff = (end - start) / (1000 * 60 * 60);
        if (diff > 0) total += diff;
      }
    });
    return total;
  };

  const logDebug = (message) => {
    setDebugLog(prev => [...prev, message]);
  };

  const generateSchedule = () => {
    setDebugLog([]); // Clear debug log
    logDebug("Starting schedule generation");
    logDebug(`Total employees: ${employees.length}`);
    logDebug("Daily goals:", dailyHourGoals);

    // Pre-calculate custom time hours for each employee
    const customHours = {};
    employees.forEach(emp => {
      logDebug(`\nAnalyzing ${emp.name}'s custom times:`);
      customHours[emp.name] = {};
      let totalCustomHours = 0;
      
      for (const day of days) {
        if (emp.customTimes?.[day]) {
          const customTime = emp.customTimes[day];
          if (customTime.start && customTime.end) {
            const start = parseInt(customTime.start.split(':')[0]);
            const end = parseInt(customTime.end.split(':')[0]);
            const hours = end - start;
            customHours[emp.name][day] = hours;
            totalCustomHours += hours;
            logDebug(`  ${day}: ${customTime.start}-${customTime.end} (${hours} hours) - Type: ${customTime.shiftType}`);
          }
        }
      }
      logDebug(`${emp.name} total custom hours: ${totalCustomHours}`);
    });

    // First pass: Assign shifts based on employee goals
    for (const day of days) {
      logDebug(`\n=== Processing ${day} (Goal: ${dailyHourGoals[day]} hours) ===`);
      logDebug("Processing shifts in order:", Object.keys(shifts).join(", "), "(by duration)");

      for (const [shiftKey, shift] of Object.entries(shifts)) {
        logDebug(`\n--- Processing ${shiftKey} shift (${shift.duration} hours) ---`);
        logDebug("Current schedule for", day + ":", JSON.stringify(schedule[day] || {}));

        // Find available employees who haven't met their goal
        const availableEmployees = employees.filter(emp => {
          const scheduledHours = Object.values(schedule).reduce((total, daySchedule) => {
            return total + (Object.values(daySchedule).find(s => s?.name === emp.name)?.duration || 0);
          }, 0);
          
          const dayCustomHours = customHours[emp.name]?.[day] || 0;
          const totalHours = scheduledHours + dayCustomHours;
          const wouldExceedGoal = totalHours + shift.duration > emp.hourGoal;

          logDebug(`\nChecking ${emp.name}:`);
          logDebug(`  Scheduled hours: ${scheduledHours}`);
          logDebug(`  Custom hours: ${dayCustomHours}`);
          logDebug(`  Current total: ${totalHours}`);
          logDebug(`  Goal hours: ${emp.hourGoal}`);
          logDebug(`  This shift: ${shiftKey} (${shift.duration} hours)`);
          logDebug(`  Would be total: ${totalHours + shift.duration}`);
          logDebug(`  Distance from goal: ${emp.hourGoal - totalHours}`);
          logDebug(`  Would exceed goal: ${wouldExceedGoal}`);
          logDebug(`  ${emp.name} regular availability: ${emp.availability?.[day]?.[shiftKey] ? "available" : "not available"}`);

          return (
            !wouldExceedGoal &&
            emp.availability?.[day]?.[shiftKey] &&
            (!schedule[day]?.[shiftKey] || schedule[day][shiftKey].name !== emp.name)
          );
        });

        logDebug("Available employees who haven't met their goal:", availableEmployees.map(e => e.name).join(", "));
        logDebug("Already assigned employees for", day + ":", Object.values(schedule[day] || {}).map(s => s?.name).filter(Boolean).join(", "));

        if (availableEmployees.length > 0) {
          // Sort by distance from goal (those furthest from goal get priority)
          availableEmployees.sort((a, b) => {
            const aHours = Object.values(schedule).reduce((total, daySchedule) => {
              return total + (Object.values(daySchedule).find(s => s?.name === a.name)?.duration || 0);
            }, 0);
            
            const bHours = Object.values(schedule).reduce((total, daySchedule) => {
              return total + (Object.values(daySchedule).find(s => s?.name === b.name)?.duration || 0);
            }, 0);
            
            return (a.hourGoal - aHours) - (b.hourGoal - bHours);
          });

          const selectedEmployee = availableEmployees[0];
          logDebug("Selected", selectedEmployee.name, "for", shiftKey, "shift");
          
          if (!schedule[day]) schedule[day] = {};
          schedule[day][shiftKey] = {
            name: selectedEmployee.name,
            duration: shift.duration,
            availability: selectedEmployee.availability,
            customTimes: selectedEmployee.customTimes,
            roles: selectedEmployee.roles,
            hourGoal: selectedEmployee.hourGoal
          };
          
          const newHours = Object.values(schedule).reduce((total, daySchedule) => {
            return total + (Object.values(daySchedule).find(s => s?.name === selectedEmployee.name)?.duration || 0);
          }, 0);
          logDebug("Updated hours for", selectedEmployee.name + ":", newHours);
        } else {
          logDebug("No available employees for", shiftKey, "shift");
        }
      }
    }

    // Second pass: Fill remaining shifts to meet daily goals
    for (const day of days) {
      if (dailyHourGoals[day] === 0) {
        logDebug(`\nSkipping ${day} - zero hour goal`);
        continue;
      }

      logDebug(`\n=== Processing ${day} for daily goals ===`);
      const currentDailyTotal = Object.values(schedule[day] || {}).reduce((total, shift) => total + (shift?.duration || 0), 0);
      const dailyMin = Math.max(0, dailyHourGoals[day] - 8);
      const dailyMax = dailyHourGoals[day] + 8;
      
      logDebug(`Current daily total: ${currentDailyTotal}`);
      logDebug(`Daily goal: ${dailyHourGoals[day]}`);
      logDebug(`Daily min: ${dailyMin}`);
      logDebug(`Daily max: ${dailyMax}`);
      logDebug("Processing shifts in order:", Object.keys(shifts).join(", "), "(by duration)");

      for (const [shiftKey, shift] of Object.entries(shifts)) {
        logDebug(`\n--- Processing ${shiftKey} shift for daily goals ---`);
        
        if (schedule[day]?.[shiftKey]) {
          logDebug(`Shift ${shiftKey} already filled by ${schedule[day][shiftKey].name}, skipping`);
          continue;
        }

        const availableEmployees = employees.filter(emp => {
          const scheduledHours = Object.values(schedule).reduce((total, daySchedule) => {
            return total + (Object.values(daySchedule).find(s => s?.name === emp.name)?.duration || 0);
          }, 0);
          
          const dayCustomHours = customHours[emp.name]?.[day] || 0;
          const totalHours = scheduledHours + dayCustomHours;
          const wouldExceedGoal = totalHours + shift.duration > emp.hourGoal;

          logDebug(`\nChecking ${emp.name} for ${shiftKey} shift:`);
          logDebug(`  Scheduled hours: ${scheduledHours}`);
          logDebug(`  Custom hours: ${dayCustomHours}`);
          logDebug(`  Current total: ${totalHours}`);
          logDebug(`  Goal hours: ${emp.hourGoal}`);
          logDebug(`  This shift: ${shiftKey} (${shift.duration} hours)`);
          logDebug(`  Would be total: ${totalHours + shift.duration}`);
          logDebug(`  Would exceed goal: ${wouldExceedGoal}`);
          if (emp.customTimes?.[day]) {
            logDebug(`  Has custom time: does not match shift`);
          } else {
            logDebug(`  Regular availability: ${emp.availability?.[day]?.[shiftKey] ? "available" : "not available"}`);
          }

          return (
            !wouldExceedGoal &&
            emp.availability?.[day]?.[shiftKey] &&
            !emp.customTimes?.[day] // Don't assign if they have a custom time
          );
        });

        logDebug("Available employees for", shiftKey, "shift:", availableEmployees.map(e => e.name).join(", "));

        if (availableEmployees.length > 0 && currentDailyTotal < dailyMax) {
          // Sort by total hours (those with fewer hours get priority)
          availableEmployees.sort((a, b) => {
            const aHours = Object.values(schedule).reduce((total, daySchedule) => {
              return total + (Object.values(daySchedule).find(s => s?.name === a.name)?.duration || 0);
            }, 0);
            
            const bHours = Object.values(schedule).reduce((total, daySchedule) => {
              return total + (Object.values(daySchedule).find(s => s?.name === b.name)?.duration || 0);
            }, 0);
            
            return aHours - bHours;
          });

          const selectedEmployee = availableEmployees[0];
          logDebug("Selected", selectedEmployee.name, "for", shiftKey, "shift to meet daily goal");
          
          if (!schedule[day]) schedule[day] = {};
          schedule[day][shiftKey] = {
            name: selectedEmployee.name,
            duration: shift.duration,
            availability: selectedEmployee.availability,
            customTimes: selectedEmployee.customTimes,
            roles: selectedEmployee.roles,
            hourGoal: selectedEmployee.hourGoal
          };
        } else {
          logDebug("No available employees for", shiftKey, "shift");
        }
      }
    }

    // Print final schedule
    logDebug("\n=== Final Schedule Summary ===");
    for (const day of days) {
      logDebug(`\n${day}:`);
      for (const [shiftKey, shift] of Object.entries(shifts)) {
        logDebug(`  ${shiftKey}: ${schedule[day]?.[shiftKey]?.name || "unfilled"}`);
      }
    }

    // Print final hours summary
    logDebug("\n=== Final Hours Summary ===");
    for (const emp of employees) {
      const scheduledHours = Object.values(schedule).reduce((total, daySchedule) => {
        return total + Object.values(daySchedule).reduce((dayTotal, shift) => {
          return dayTotal + (shift?.name === emp.name ? shiftDurations[shift.shiftType] : 0);
        }, 0);
      }, 0);
      const customHoursTotal = Object.values(customHours[emp.name] || {}).reduce((total, hours) => total + hours, 0);
      
      logDebug(`${emp.name}: ${scheduledHours} scheduled + ${customHoursTotal} custom = ${scheduledHours + customHoursTotal} total (goal: ${emp.hourGoal})`);
    }

    // Optimization pass: Remove excess shifts to get closer to daily goals
    logDebug("\n=== Starting Optimization Pass ===");
    for (const day of days) {
      if (dailyHourGoals[day] === 0) {
        logDebug(`Skipping ${day} - zero hour goal`);
        continue;
      }

      const currentDailyTotal = Object.values(schedule[day] || {}).reduce((total, shift) => total + (shift?.duration || 0), 0);
      const difference = currentDailyTotal - dailyHourGoals[day];
      
      if (difference <= 0) {
        logDebug(`${day}: No excess hours to remove (current: ${currentDailyTotal}, goal: ${dailyHourGoals[day]})`);
        continue;
      }

      logDebug(`\nOptimizing ${day}:`);
      logDebug(`  Current total: ${currentDailyTotal}`);
      logDebug(`  Daily goal: ${dailyHourGoals[day]}`);
      logDebug(`  Difference: ${difference}`);

      // Create array of all shifts for this day, sorted by duration
      const dayShifts = Object.entries(schedule[day] || {})
        .filter(([_, shift]) => shift !== null)
        .map(([shiftKey, shift]) => ({
          shiftKey,
          employee: shift.name,
          duration: shiftDurations[shiftKey]
        }))
        .sort((a, b) => a.duration - b.duration);

      logDebug(`  Available shifts to remove: ${dayShifts.map(s => `${s.employee}'s ${s.shiftKey} (${s.duration}h)`).join(', ')}`);

      // Try removing each shift, starting with the smallest
      let bestDifference = difference;
      let bestShiftToRemove = null;

      for (const shift of dayShifts) {
        const newDifference = difference - shift.duration;
        logDebug(`  Testing removal of ${shift.employee}'s ${shift.shiftKey} (${shift.duration}h):`);
        logDebug(`    New difference would be: ${newDifference}`);

        // If removing this shift gets us closer to the goal, keep track of it
        if (Math.abs(newDifference) < Math.abs(bestDifference)) {
          bestDifference = newDifference;
          bestShiftToRemove = shift;
          logDebug(`    This is better than current best difference of ${bestDifference}`);
        }
      }

      // If we found a shift to remove that improves the schedule
      if (bestShiftToRemove) {
        logDebug(`  Removing ${bestShiftToRemove.employee}'s ${bestShiftToRemove.shiftKey} shift`);
        schedule[day][bestShiftToRemove.shiftKey] = null;
        
        const newDailyTotal = Object.values(schedule[day] || {}).reduce((total, shift) => total + (shift?.duration || 0), 0);
        logDebug(`  New daily total: ${newDailyTotal}`);
        logDebug(`  New difference: ${newDailyTotal - dailyHourGoals[day]}`);
      } else {
        logDebug(`  No beneficial shifts to remove found`);
      }
    }

    setSchedule(schedule);
  };

  const getScheduledHours = (employee, day) => {
    const employeeObj = employees.find(e => e.name === employee);
    if (!employeeObj) return 0;

    let totalHours = 0;
    
    // Count regular shift hours
    Object.entries(schedule[day] || {}).forEach(([shiftKey, shift]) => {
      if (shift && shift.name === employee) {
        totalHours += shiftDurations[shiftKey];
      }
    });

    // Only count custom hours for the specific day
    if (employeeObj.customTimes && employeeObj.customTimes[day]) {
      const customTime = employeeObj.customTimes[day];
      if (customTime.start && customTime.end) {
        const start = parseInt(customTime.start.split(':')[0]);
        const end = parseInt(customTime.end.split(':')[0]);
        totalHours += end - start;
      }
    }

    return totalHours;
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
    const exportData = employees.map((emp) => {
      const row = { Employee: emp.name };
      for (const day of days) {
        const shift = Object.entries(schedule[day] || {}).find(
          ([, val]) => val?.name === emp.name
        );
        row[day] = shift ? shifts[shift[0]] : "";
      }
      row["Total Hours"] = getScheduledHours(emp.name, "Monday");
      return row;
    });

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Schedule");
    writeFile(wb, "schedule.xlsx");
  };

  const isDayCovered = (day) => {
    const daySchedule = schedule[day] || {};
    
    // Check manager coverage
    const hasOpeningManager = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Opening" && emp?.roles?.manager);
    const hasClosingManager = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Closing" && emp?.roles?.manager);
    
    if (!hasOpeningManager || !hasClosingManager) return false;

    // Check driver and insider coverage for each shift
    const shifts = ["Opening", "Midshift", "Closing"];
    for (const shift of shifts) {
      const shiftEmployees = Object.entries(daySchedule)
        .filter(([s, emp]) => s === shift && emp)
        .map(([_, emp]) => emp);
      
      const hasDriver = shiftEmployees.some(emp => emp.roles?.driver);
      const hasInsider = shiftEmployees.some(emp => emp.roles?.insider);
      
      if (!hasDriver || !hasInsider) return false;
    }

    return true;
  };

  const getAvailableEmployees = (day, shiftKey) => {
    return employees.filter(emp => emp.availability?.[day]?.[shiftKey])
      .map(emp => emp.name)
      .join(", ");
  };

  const getTotalHoursForEmployee = (empName) => {
    let total = 0;
    for (const day of days) {
      total += getScheduledHours(empName, day);
    }
    return total;
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
                {val === 999 ? "40+" : val + " hrs"}
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

      {/* Add Daily Hour Goals */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow mb-6">
        <h2 className="text-lg font-bold mb-4">Daily Hour Goals</h2>
        <div className="grid grid-cols-7 gap-4">
          {days.map(day => (
            <div key={day} className="flex flex-col">
              <label className="text-sm font-medium mb-1">{day}</label>
              <input
                type="number"
                value={dailyHourGoals[day]}
                onChange={(e) => setDailyHourGoals(prev => ({
                  ...prev,
                  [day]: parseInt(e.target.value) || 0
                }))}
                className="border p-2 rounded text-black"
                min="0"
              />
            </div>
          ))}
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
                        const assignedShift = Object.entries(schedule[day] || {}).find(
                          ([, val]) => val?.name === emp.name
                        );
                        const customTime = emp.customTimes?.[day];
                        const shiftType = customTime?.shiftType;
                        const customTimeDisplay = formatCustomTime(customTime?.start, customTime?.end);
                        
                        return (
                          <td 
                            key={day} 
                            className={`border p-2 text-sm text-center relative group ${
                              assignedShift ? shiftColors[assignedShift[0]] : 
                              customTime?.start && customTime?.end ? shiftColors[shiftType] : ""
                            }`}
                          >
                            {assignedShift ? shifts[assignedShift[0]] : customTimeDisplay}
                            <div className="absolute hidden group-hover:block z-10 w-48 p-2 bg-white text-black text-xs rounded shadow-lg">
                              Available: {getAvailableEmployees(day, assignedShift?.[0] || Object.keys(shifts)[0])}
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
              {days.map((day) => (
                <td key={day} className="border p-2 text-center">
                  {isDayCovered(day) ? "Yes" : "No"}
                </td>
              ))}
              <td className="border p-2" colSpan="2"></td>
            </tr>
            {/* Add Daily Total Hours Row */}
            <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
              <td className="border p-2">Daily Total Hours</td>
              {days.map(day => (
                <td key={day} className="border p-2 text-center">
                  {getDailyTotalHours(day)}
                </td>
              ))}
              <td className="border p-2"></td>
              <td className="border p-2"></td>
            </tr>
            {/* Add Hours Needed Row */}
            <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
              <td className="border p-2">Hours Needed</td>
              {days.map(day => (
                <td key={day} className="border p-2 text-center">
                  {dailyHourGoals[day]}
                </td>
              ))}
              <td className="border p-2 text-center">
                {Object.values(dailyHourGoals).reduce((sum, hours) => sum + hours, 0)}
              </td>
              <td className="border p-2"></td>
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

      {/* Add Debug Button */}
      <div className="fixed bottom-4 right-4">
        <button
          className="bg-gray-600 text-white px-4 py-2 rounded"
          onClick={() => setShowDebug(true)}
        >
          Show Debug Log
        </button>
      </div>

      {/* Debug Popup */}
      {showDebug && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg max-w-4xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Debug Log</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowDebug(false)}
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {debugLog.join('\n')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
