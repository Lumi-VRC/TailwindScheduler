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
  const [dailyHourGoals, setDailyHourGoals] = useState({
    Monday: 40,
    Tuesday: 40,
    Wednesday: 40,
    Thursday: 40,
    Friday: 40,
    Saturday: 40,
    Sunday: 40
  });
  const [schedule, setSchedule] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);

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

  const generateSchedule = (empList = employees) => {
    const hoursScheduled = {};
    const newSchedule = {};

    // Pre-calculate custom time hours for each employee
    const customHours = {};
    empList.forEach(emp => {
      customHours[emp.name] = 0;
      for (const day of days) {
        const customTime = emp.customTimes?.[day];
        if (customTime?.start && customTime?.end) {
          const start = new Date(`2000-01-01T${customTime.start}`);
          const end = new Date(`2000-01-01T${customTime.end}`);
          const diff = (end - start) / (1000 * 60 * 60);
          if (diff > 0) customHours[emp.name] += diff;
        }
      }
    });

    // Calculate current daily hours (store total)
    const currentDailyHours = {};
    days.forEach(day => {
      currentDailyHours[day] = 0;
      // Add hours from custom times
      empList.forEach(emp => {
        const customTime = emp.customTimes?.[day];
        if (customTime?.start && customTime?.end) {
          const start = new Date(`2000-01-01T${customTime.start}`);
          const end = new Date(`2000-01-01T${customTime.end}`);
          const diff = (end - start) / (1000 * 60 * 60);
          if (diff > 0) currentDailyHours[day] += diff;
        }
      });
    });

    for (const day of days) {
      newSchedule[day] = {};

      for (const shiftKey of Object.keys(shifts)) {
        const available = empList.filter((e) => {
          // Calculate total hours (scheduled + custom)
          const scheduled = hoursScheduled[e.name] || 0;
          const custom = customHours[e.name] || 0;
          const total = scheduled + custom;
          
          // Check if total hours are at or over goal
          const goal = e.hourGoal === 999 ? 40 : e.hourGoal;
          const upperBound = e.hourGoal === 999 ? 999 : goal + 8;
          
          // Get store's daily hour goal
          const dailyGoal = dailyHourGoals[day];
          const dailyUpperBound = dailyGoal + 8;
          const dailyLowerBound = dailyGoal - 8;
          
          if (currentDailyHours[day] < dailyLowerBound) {
            // If store hours are below lower bound, allow scheduling even if over employee goal
            return scheduled + custom + shiftDurations[shiftKey] <= upperBound;
          } else if (currentDailyHours[day] >= dailyUpperBound) {
            // If store hours are above upper bound, don't schedule anyone
            return false;
          } else {
            // Otherwise, respect employee goals
            return total < goal;
          }

          // Then check if they have a custom time for this day
          const hasCustomTime = e.customTimes?.[day]?.start && e.customTimes?.[day]?.end;
          if (hasCustomTime) {
            return e.customTimes[day].shiftType === shiftKey;
          }
          // Otherwise check regular availability
          return e.availability?.[day]?.[shiftKey];
        });

        if (available.length === 0) {
          newSchedule[day][shiftKey] = null;
          continue;
        }

        // Sort: prioritize employees furthest from their goal (but within bounds), then least flexible
        const sorted = available
          .filter((emp) => {
            const scheduled = hoursScheduled[emp.name] || 0;
            const custom = customHours[emp.name] || 0;
            const goal = emp.hourGoal === 999 ? 40 : emp.hourGoal;
            const upperBound = emp.hourGoal === 999 ? 999 : goal + 8;
            return scheduled + custom + shiftDurations[shiftKey] <= upperBound;
          })
          .sort((a, b) => {
            const hoursA = (hoursScheduled[a.name] || 0) + (customHours[a.name] || 0);
            const hoursB = (hoursScheduled[b.name] || 0) + (customHours[b.name] || 0);
            const goalA = a.hourGoal === 999 ? 40 : a.hourGoal;
            const goalB = b.hourGoal === 999 ? 40 : b.hourGoal;
            const flexA = countAvailableShifts(a);
            const flexB = countAvailableShifts(b);

            // Calculate how far each employee is from their goal
            const distanceFromGoalA = Math.abs(hoursA - goalA);
            const distanceFromGoalB = Math.abs(hoursB - goalB);

            // First sort by distance from goal (closer to goal = lower priority)
            if (distanceFromGoalA !== distanceFromGoalB) {
              return distanceFromGoalB - distanceFromGoalA;
            }

            // If same distance from goal, prefer less flexible employees
            return flexA - flexB;
          });

        const alreadyAssigned = new Set(
          Object.values(newSchedule[day]).filter(Boolean).map((e) => e.name)
        );

        const picked = sorted.find((e) => !alreadyAssigned.has(e.name));
        if (picked) {
          newSchedule[day][shiftKey] = picked;
          hoursScheduled[picked.name] = (hoursScheduled[picked.name] || 0) + shiftDurations[shiftKey];
          currentDailyHours[day] += shiftDurations[shiftKey];
        } else {
          newSchedule[day][shiftKey] = null;
        }
      }
    }

    setSchedule(newSchedule);
  };

  const getScheduledHours = (empName) => {
    let total = 0;
    const employee = employees.find(e => e.name === empName);
    
    for (const day of days) {
      for (const [shiftKey, emp] of Object.entries(schedule[day] || {})) {
        if (emp?.name === empName) {
          total += shiftDurations[shiftKey];
        }
      }
      // Add custom time hours if they exist
      const customTime = employee?.customTimes?.[day];
      if (customTime?.start && customTime?.end) {
        const start = new Date(`2000-01-01T${customTime.start}`);
        const end = new Date(`2000-01-01T${customTime.end}`);
        const diff = (end - start) / (1000 * 60 * 60); // Convert to hours
        if (diff > 0) total += diff;
      }
    }
    return total;
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
      row["Total Hours"] = getScheduledHours(emp.name);
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

  // Add function to calculate daily store hours
  const getDailyStoreHours = (day) => {
    let total = 0;
    
    // Add hours from scheduled shifts
    for (const [shiftKey, emp] of Object.entries(schedule[day] || {})) {
      if (emp) {
        total += shiftDurations[shiftKey];
      }
    }
    
    // Add hours from custom times
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

  return (
    <div className="p-6 max-w-6xl mx-auto dark:bg-gray-900 dark:text-white">
      <h1 className="text-2xl font-bold mb-4">Smart Shift Scheduler</h1>

      {/* Dark Mode Toggle */}
      <div className="mb-4">
        <button
          onClick={() => {
            document.documentElement.classList.toggle('dark');
          }}
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

      {/* Daily Hour Goals */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Daily Hour Goals</h2>
        <div className="grid grid-cols-7 gap-4">
          {days.map((day) => (
            <div key={day} className="flex flex-col">
              <label className="text-sm font-medium mb-1">{day}</label>
              <input
                type="number"
                min="0"
                value={dailyHourGoals[day]}
                onChange={(e) => setDailyHourGoals(prev => ({
                  ...prev,
                  [day]: parseInt(e.target.value) || 0
                }))}
                className="border p-2 rounded text-black"
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
                      <td className="border p-2 text-center">{getScheduledHours(emp.name)} hrs</td>
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
            {/* Daily Totals Row */}
            <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
              <td className="border p-2">Store Total Hours</td>
              {days.map((day) => (
                <td key={day} className="border p-2 text-center">
                  {getDailyStoreHours(day)} hrs
                </td>
              ))}
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
