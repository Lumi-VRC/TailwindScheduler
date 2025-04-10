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
    const newSchedule = {};
    const roleCounts = {};
    const employeeHours = {};
    const employeeShifts = {};
    const debugLog = [];

    // Initialize role counts and employee tracking
    days.forEach(day => {
      roleCounts[day] = {
        manager: { opening: 0, midshift: 0, closing: 0 },
        driver: { opening: 0, midshift: 0, closing: 0 },
        insider: { opening: 0, midshift: 0, closing: 0 }
      };
      employeeHours[day] = {};
      employeeShifts[day] = {};
    });

    // Pre-calculate custom hours for each employee
    const customHoursByEmployee = {};
    employees.forEach(emp => {
      customHoursByEmployee[emp.name] = {};
      days.forEach(day => {
        customHoursByEmployee[emp.name][day] = emp.customTimes[day] || 0;
      });
    });

    // First pass: Assign shifts based on employee goals and availability
    days.forEach(day => {
      newSchedule[day] = {};
      const shifts = ['opening', 'midshift', 'closing'];
      
      shifts.forEach(shift => {
        const shiftKey = `${day}-${shift}`;
        const shiftDuration = shiftDurations[shiftKey];
        
        // Get available employees for this shift
        const availableEmployees = employees.filter(emp => {
          const isAvailable = emp.availability[day]?.[shift] || false;
          const currentHours = employeeHours[day][emp.name] || 0;
          const customHours = customHoursByEmployee[emp.name][day] || 0;
          const totalHours = currentHours + customHours;
          const goal = emp.hourGoal;
          
          // Check if employee is within 8 hours of their goal (or above 40)
          const isWithinGoalRange = 
            (totalHours >= goal - 8 && totalHours <= goal + 8) || 
            (goal >= 40 && totalHours >= goal - 8);
            
          return isAvailable && isWithinGoalRange;
        });

        // Sort available employees by how close they are to their goal
        availableEmployees.sort((a, b) => {
          const aHours = (employeeHours[day][a.name] || 0) + (customHoursByEmployee[a.name][day] || 0);
          const bHours = (employeeHours[day][b.name] || 0) + (customHoursByEmployee[b.name][day] || 0);
          const aDiff = Math.abs(a.hourGoal - aHours);
          const bDiff = Math.abs(b.hourGoal - bHours);
          return aDiff - bDiff;
        });

        // Assign employees to meet role requirements
        const roles = ['manager', 'driver', 'insider'];
        roles.forEach(role => {
          const requiredCount = roleRequirements[day][role][shift];
          let assignedCount = 0;

          // Try to assign employees of the correct role
          for (const emp of availableEmployees) {
            if (assignedCount >= requiredCount) break;
            if (emp.roles[role]) {
              if (!newSchedule[day][shiftKey]) {
                newSchedule[day][shiftKey] = [];
              }
              newSchedule[day][shiftKey].push(emp.name);
              employeeHours[day][emp.name] = (employeeHours[day][emp.name] || 0) + shiftDuration;
              employeeShifts[day][emp.name] = (employeeShifts[day][emp.name] || 0) + 1;
              roleCounts[day][role][shift]++;
              assignedCount++;
            }
          }
        });
      });
    });

    // Second pass: Fill remaining shifts to meet daily goals
    days.forEach(day => {
      const shifts = ['opening', 'midshift', 'closing'];
      
      shifts.forEach(shift => {
        const shiftKey = `${day}-${shift}`;
        const shiftDuration = shiftDurations[shiftKey];
        
        // Get available employees who are within 8 hours of their goal
        const availableEmployees = employees.filter(emp => {
          const isAvailable = emp.availability[day]?.[shift] || false;
          const currentHours = employeeHours[day][emp.name] || 0;
          const customHours = customHoursByEmployee[emp.name][day] || 0;
          const totalHours = currentHours + customHours;
          const goal = emp.hourGoal;
          
          const isWithinGoalRange = 
            (totalHours >= goal - 8 && totalHours <= goal + 8) || 
            (goal >= 40 && totalHours >= goal - 8);
            
          return isAvailable && isWithinGoalRange;
        });

        // Sort available employees by how close they are to their goal
        availableEmployees.sort((a, b) => {
          const aHours = (employeeHours[day][a.name] || 0) + (customHoursByEmployee[a.name][day] || 0);
          const bHours = (employeeHours[day][b.name] || 0) + (customHoursByEmployee[b.name][day] || 0);
          const aDiff = Math.abs(a.hourGoal - aHours);
          const bDiff = Math.abs(b.hourGoal - bHours);
          return aDiff - bDiff;
        });

        // Fill remaining shifts
        const roles = ['manager', 'driver', 'insider'];
        roles.forEach(role => {
          const requiredCount = roleRequirements[day][role][shift];
          const currentCount = roleCounts[day][role][shift];
          
          if (currentCount < requiredCount) {
            // Try to assign employees of the correct role
            for (const emp of availableEmployees) {
              if (emp.roles[role]) {
                if (!newSchedule[day][shiftKey]) {
                  newSchedule[day][shiftKey] = [];
                }
                newSchedule[day][shiftKey].push(emp.name);
                employeeHours[day][emp.name] = (employeeHours[day][emp.name] || 0) + shiftDuration;
                employeeShifts[day][emp.name] = (employeeShifts[day][emp.name] || 0) + 1;
                roleCounts[day][role][shift]++;
                break;
              }
            }
          }
        });
      });
    });

    // Log the schedule and role counts
    debugLog.push("Schedule Analysis:");
    days.forEach(day => {
      debugLog.push(`\n${day}:`);
      const shifts = ['opening', 'midshift', 'closing'];
      shifts.forEach(shift => {
        const shiftKey = `${day}-${shift}`;
        debugLog.push(`  ${shift}:`);
        if (newSchedule[day][shiftKey]) {
          newSchedule[day][shiftKey].forEach(empName => {
            const emp = employees.find(e => e.name === empName);
            const hours = employeeHours[day][empName] || 0;
            const customHours = customHoursByEmployee[empName][day] || 0;
            const totalHours = hours + customHours;
            debugLog.push(`    ${empName} (${emp.roles.manager ? "manager" : emp.roles.driver ? "driver" : "insider"}): ${hours} regular + ${customHours} custom = ${totalHours} total hours`);
          });
        }
      });
    });

    // Log role requirements vs actual counts
    debugLog.push("\nRole Requirements vs Actual Counts:");
    days.forEach(day => {
      debugLog.push(`\n${day}:`);
      const roles = ['manager', 'driver', 'insider'];
      const shifts = ['opening', 'midshift', 'closing'];
      roles.forEach(role => {
        shifts.forEach(shift => {
          const required = roleRequirements[day][role][shift];
          const actual = roleCounts[day][role][shift];
          debugLog.push(`  ${role} ${shift}: ${actual}/${required}`);
        });
      });
    });

    // Log employee hours summary
    debugLog.push("\nEmployee Hours Summary:");
    employees.forEach(emp => {
      let totalHours = 0;
      days.forEach(day => {
        const hours = employeeHours[day][emp.name] || 0;
        const customHours = customHoursByEmployee[emp.name][day] || 0;
        totalHours += hours + customHours;
      });
      debugLog.push(`${emp.name}: ${totalHours} hours (goal: ${emp.hourGoal})`);
    });

    setSchedule(newSchedule);
    setDebugLog(debugLog.join('\n'));
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
              {debugLog}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
