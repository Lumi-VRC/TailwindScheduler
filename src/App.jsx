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
  const [schedule, setSchedule] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
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

  // Save role requirements to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('roleRequirements', JSON.stringify(roleRequirements));
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
    console.log("Starting schedule generation");
    console.log(`Total employees: ${employees.length}`);
    console.log("\n=== Employee Analysis ===");
    employees.forEach(emp => {
      console.log(`\nAnalyzing ${emp.name}:`);
      console.log(`  Role: ${emp.role}`);
      console.log(`  Goal Hours: ${emp.goalHours}`);
      console.log(`  Regular Availability: ${JSON.stringify(emp.regularAvailability)}`);
      console.log(`  Custom Times: ${JSON.stringify(emp.customTimes)}`);
    });

    const newSchedule = {};
    const roleCounts = {};
    const scheduledHours = {};

    // Initialize role counts and scheduled hours
    days.forEach(day => {
      roleCounts[day] = {
        Opening: { manager: 0, driver: 0, insider: 0 },
        Midshift: { manager: 0, driver: 0, insider: 0 },
        Closing: { manager: 0, driver: 0, insider: 0 }
      };
      scheduledHours[day] = {};
    });

    // First pass: Fill required roles
    days.forEach(day => {
      console.log(`\n=== Processing ${day} ===`);
      
      // Process each shift type
      Object.keys(roleRequirements[day]).forEach(shiftType => {
        console.log(`\n--- Processing ${shiftType} shift ---`);
        const shiftDurations = {
          Opening: 8,
          Midshift: 8,
          Closing: 8
        };

        // Get required roles for this shift
        const requiredRoles = roleRequirements[day][shiftType];
        console.log(`Required roles for ${shiftType}:`, requiredRoles);

        // Try to fill each required role
        Object.entries(requiredRoles).forEach(([role, count]) => {
          console.log(`\nFilling ${count} ${role}(s) for ${shiftType}`);
          
          for (let i = 0; i < count; i++) {
            // Find available employees for this role
            const availableEmployees = employees.filter(emp => {
              const isAvailable = emp.regularAvailability[day]?.[shiftType] || 
                                emp.customTimes[day]?.some(ct => ct.type === shiftType);
              const hasRole = emp.role === role;
              const currentHours = (scheduledHours[day][emp.name] || 0) + 
                                 (emp.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              const wouldExceedGoal = currentHours + shiftDurations[shiftType] > emp.goalHours;
              
              if (emp.name === "Kaimyn") {
                console.log(`\nChecking Kaimyn for ${shiftType} ${role}:`);
                console.log(`  Is available: ${isAvailable}`);
                console.log(`  Has correct role: ${hasRole}`);
                console.log(`  Current hours: ${currentHours}`);
                console.log(`  Would exceed goal: ${wouldExceedGoal}`);
                console.log(`  Role counts: ${JSON.stringify(roleCounts[day][shiftType])}`);
              }

              return isAvailable && hasRole && !wouldExceedGoal;
            });

            if (availableEmployees.length === 0) {
              console.log(`No available ${role}s for ${shiftType} shift on ${day}`);
              continue;
            }

            // Sort by distance from goal hours
            availableEmployees.sort((a, b) => {
              const aHours = (scheduledHours[day][a.name] || 0) + 
                           (a.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              const bHours = (scheduledHours[day][b.name] || 0) + 
                           (b.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              return (a.goalHours - aHours) - (b.goalHours - bHours);
            });

            const selectedEmployee = availableEmployees[0];
            if (selectedEmployee.name === "Kaimyn") {
              console.log(`\nKaimyn selected for ${shiftType} ${role} on ${day}`);
              console.log(`  Current hours: ${scheduledHours[day][selectedEmployee.name] || 0}`);
              console.log(`  Custom hours: ${selectedEmployee.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0}`);
              console.log(`  Shift duration: ${shiftDurations[shiftType]}`);
            }

            // Initialize schedule for this day if needed
            if (!newSchedule[day]) {
              newSchedule[day] = {};
            }

            // Add employee to schedule
            newSchedule[day][shiftType] = {
              ...newSchedule[day][shiftType],
              [role]: selectedEmployee.name
            };

            // Update role counts and scheduled hours
            roleCounts[day][shiftType][role]++;
            scheduledHours[day][selectedEmployee.name] = (scheduledHours[day][selectedEmployee.name] || 0) + shiftDurations[shiftType];
          }
        });
      });
    });

    // Second pass: Fill remaining shifts to meet daily goals
    days.forEach(day => {
      console.log(`\n=== Filling missing roles for ${day} ===`);
      Object.keys(roleRequirements[day]).forEach(shiftType => {
        const requiredRoles = roleRequirements[day][shiftType];
        const currentRoles = roleCounts[day][shiftType];

        Object.entries(requiredRoles).forEach(([role, count]) => {
          const missing = count - currentRoles[role];
          if (missing > 0) {
            console.log(`Missing ${missing} ${role}(s) for ${shiftType} shift on ${day}`);
            
            // Find available employees who could fill this role
            const availableEmployees = employees.filter(emp => {
              const isAvailable = emp.regularAvailability[day]?.[shiftType] || 
                                emp.customTimes[day]?.some(ct => ct.type === shiftType);
              const hasRole = emp.role === role;
              const currentHours = (scheduledHours[day][emp.name] || 0) + 
                                 (emp.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              
              if (emp.name === "Kaimyn") {
                console.log(`\nChecking Kaimyn for missing ${role} in ${shiftType}:`);
                console.log(`  Is available: ${isAvailable}`);
                console.log(`  Has correct role: ${hasRole}`);
                console.log(`  Current hours: ${currentHours}`);
                console.log(`  Role counts: ${JSON.stringify(roleCounts[day][shiftType])}`);
              }

              return isAvailable && hasRole;
            });

            if (availableEmployees.length === 0) {
              console.log(`No available employees to fill missing ${role} roles for ${shiftType} shift`);
              return;
            }

            // Sort by current hours (prefer those with fewer hours)
            availableEmployees.sort((a, b) => {
              const aHours = (scheduledHours[day][a.name] || 0) + 
                           (a.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              const bHours = (scheduledHours[day][b.name] || 0) + 
                           (b.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0);
              return aHours - bHours;
            });

            const selectedEmployee = availableEmployees[0];
            if (selectedEmployee.name === "Kaimyn") {
              console.log(`\nKaimyn selected to fill missing ${role} in ${shiftType} on ${day}`);
              console.log(`  Current hours: ${scheduledHours[day][selectedEmployee.name] || 0}`);
              console.log(`  Custom hours: ${selectedEmployee.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0}`);
            }

            // Add employee to schedule
            newSchedule[day][shiftType] = {
              ...newSchedule[day][shiftType],
              [role]: selectedEmployee.name
            };

            // Update role counts and scheduled hours
            roleCounts[day][shiftType][role]++;
            scheduledHours[day][selectedEmployee.name] = (scheduledHours[day][selectedEmployee.name] || 0) + shiftDurations[shiftType];
          }
        });
      });
    });

    console.log("\n=== Final Schedule Summary ===");
    days.forEach(day => {
      console.log(`\n${day}:`);
      Object.entries(newSchedule[day] || {}).forEach(([shiftType, roles]) => {
        console.log(`  ${shiftType}: ${Object.entries(roles).map(([role, name]) => `${name} (${role})`).join(", ")}`);
      });
    });

    console.log("\n=== Final Hours Summary ===");
    employees.forEach(emp => {
      const scheduled = days.reduce((total, day) => total + (scheduledHours[day][emp.name] || 0), 0);
      const custom = days.reduce((total, day) => 
        total + (emp.customTimes[day]?.reduce((sum, ct) => sum + ct.duration, 0) || 0), 0);
      console.log(`${emp.name}: ${scheduled} scheduled + ${custom} custom = ${scheduled + custom} total (goal: ${emp.goalHours})`);
    });

    setSchedule(newSchedule);
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
    const reasons = [];
    
    // Check manager coverage
    const hasOpeningManager = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Opening" && emp?.roles?.manager);
    const hasClosingManager = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Closing" && emp?.roles?.manager);
    
    if (!hasOpeningManager) reasons.push("Missing Opening Manager");
    if (!hasClosingManager) reasons.push("Missing Closing Manager");

    // Check driver coverage for each shift
    const hasOpeningDriver = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Opening" && emp?.roles?.driver);
    const hasMidshiftDriver = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Midshift" && emp?.roles?.driver);
    const hasClosingDriver = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Closing" && emp?.roles?.driver);
    
    if (!hasOpeningDriver) reasons.push("Missing Opening Driver");
    if (!hasMidshiftDriver) reasons.push("Missing Midshift Driver");
    if (!hasClosingDriver) reasons.push("Missing Closing Driver");

    // Check insider coverage for opening and midshift
    const hasOpeningInsider = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Opening" && emp?.roles?.insider);
    const hasMidshiftInsider = Object.entries(daySchedule)
      .find(([shift, emp]) => shift === "Midshift" && emp?.roles?.insider);
    
    if (!hasOpeningInsider) reasons.push("Missing Opening Insider");
    if (!hasMidshiftInsider) reasons.push("Missing Midshift Insider");

    // Check if daily role requirements are met
    for (const [shiftKey, shift] of Object.entries(shifts)) {
      const requiredRoles = {
        manager: roleRequirements[day].manager[shiftKey],
        driver: roleRequirements[day].driver[shiftKey],
        insider: roleRequirements[day].insider[shiftKey]
      };

      // Count current assignments for this shift
      const currentAssignments = daySchedule[shiftKey] || {};
      const currentRoles = {
        manager: currentAssignments.roles?.manager ? 1 : 0,
        driver: currentAssignments.roles?.driver ? 1 : 0,
        insider: currentAssignments.roles?.insider ? 1 : 0
      };

      // Check if all required roles are met
      if (currentRoles.manager < requiredRoles.manager) {
        reasons.push(`Missing ${requiredRoles.manager} Manager(s) for ${shiftKey}`);
      }
      if (currentRoles.driver < requiredRoles.driver) {
        reasons.push(`Missing ${requiredRoles.driver} Driver(s) for ${shiftKey}`);
      }
      if (currentRoles.insider < requiredRoles.insider) {
        reasons.push(`Missing ${requiredRoles.insider} Insider(s) for ${shiftKey}`);
      }
    }

    return {
      covered: reasons.length === 0,
      reasons: reasons
    };
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
                  .filter(([shift]) => shift === "Opening")
                  .filter(([_, emp]) => emp !== null).length;
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
                  .filter(([shift]) => shift === "Midshift")
                  .filter(([_, emp]) => emp !== null).length;
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
                  .filter(([shift]) => shift === "Closing")
                  .filter(([_, emp]) => emp !== null).length;
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
