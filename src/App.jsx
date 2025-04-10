import React, { useState, useEffect } from "react";
import { utils, writeFile } from "xlsx";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState([]);
  const [preference, setPreference] = useState([]);
  const [roles, setRoles] = useState({ manager: false, insider: false, driver: false });

  const toggleDay = (day, setFunc, current) => {
    setFunc(current.includes(day) ? current.filter((d) => d !== day) : [...current, day]);
  };

  useEffect(() => {
    const saved = localStorage.getItem("employeeData");
    if (saved) setEmployees(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("employeeData", JSON.stringify(employees));
  }, [employees]);

  const addEmployee = () => {
    if (!name) return;
    setEmployees([
      ...employees,
      {
        name,
        availability: [...availability],
        preference: [...preference],
        roles: { ...roles }
      }
    ]);
    setName("");
    setAvailability([]);
    setPreference([]);
    setRoles({ manager: false, insider: false, driver: false });
  };

  const deleteEmployee = (name) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${name}"?`);
    if (confirmed) {
      setEmployees(employees.filter((e) => e.name !== name));
    }
  };

  const generateSchedule = () => {
    const schedule = {};
    days.forEach((day) => {
      schedule[day] = [];
      employees.forEach((emp) => {
        if (emp.preference.includes(day)) schedule[day].push({ name: emp.name, type: "Preferred" });
      });
      employees.forEach((emp) => {
        if (
          emp.availability.includes(day) &&
          !schedule[day].some((e) => e.name === emp.name)
        ) {
          schedule[day].push({ name: emp.name, type: "Available" });
        }
      });
    });
    return schedule;
  };

  const exportToExcel = () => {
    const schedule = generateSchedule();
    const exportData = [];

    employees.forEach((emp) => {
      const row = { Employee: emp.name };
      days.forEach((day) => {
        const match = schedule[day].find((e) => e.name === emp.name);
        row[day] = match ? match.type : "";
      });
      exportData.push(row);
    });

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Schedule");
    writeFile(wb, "schedule.xlsx");
  };

  const schedule = generateSchedule();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Weekly Scheduler</h1>

      {/* Employee Form */}
      <div className="bg-white rounded-lg p-4 shadow mb-6">
        <input
          className="border p-2 mr-4"
          value={name}
          placeholder="Employee name"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mb-2 mt-2">
          <strong>Availability:</strong>
          <div className="flex flex-wrap gap-2 mt-1">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day, setAvailability, availability)}
                className={`px-2 py-1 border rounded ${
                  availability.includes(day) ? "bg-blue-200" : "bg-gray-100"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <strong>Preference:</strong>
          <div className="flex flex-wrap gap-2 mt-1">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day, setPreference, preference)}
                className={`px-2 py-1 border rounded ${
                  preference.includes(day) ? "bg-green-200" : "bg-gray-100"
                }`}
              >
                {day}
              </button>
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

        <button
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded"
          onClick={addEmployee}
        >
          Add Employee
        </button>
      </div>

      {/* Schedule Grid */}
      <div className="overflow-auto">
        <table className="table-auto border-collapse w-full mb-4">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100">Employee</th>
              {days.map((day) => (
                <th key={day} className="border p-2 bg-gray-100">{day}</th>
              ))}
              <th className="border p-2 bg-gray-100">Actions</th>
            </tr>
          </thead>
          <tbody>
            {["manager", "insider", "driver"].map((roleKey) => {
              const group = employees.filter((e) => e.roles?.[roleKey]);
              if (group.length === 0) return null;

              return (
                <React.Fragment key={roleKey}>
                  <tr>
                    <td colSpan={days.length + 2} className="bg-gray-200 font-bold p-2 text-left">
                      {roleKey.charAt(0).toUpperCase() + roleKey.slice(1)}
                    </td>
                  </tr>
                  {group.map((emp) => (
                    <tr key={emp.name}>
                      <td className="border p-2">{emp.name}</td>
                      {days.map((day) => {
                        const match = schedule[day].find((e) => e.name === emp.name);
                        return (
                          <td
                            key={day}
                            className={`border p-2 ${
                              match?.type === "Preferred"
                                ? "bg-green-100"
                                : match?.type === "Available"
                                ? "bg-blue-100"
                                : ""
                            }`}
                          >
                            {match?.type || ""}
                          </td>
                        );
                      })}
                      <td className="border p-2 text-center">
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
