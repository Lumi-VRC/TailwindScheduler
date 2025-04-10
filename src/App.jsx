import React, { useState, useEffect } from "react";
import { utils, writeFile } from "xlsx";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shiftTimes = {
  Opening: "9:30am-5:30pm",
  Midshift: "4pm - 9pm",
  Closing: "5pm - 1am",
};

const App = () => {
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState({});
  const [roles, setRoles] = useState({ manager: false, insider: false, driver: false });

  const [shiftPicker, setShiftPicker] = useState({ open: false, day: "", setFunc: null });

  useEffect(() => {
    const saved = localStorage.getItem("employeeData");
    if (saved) setEmployees(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("employeeData", JSON.stringify(employees));
  }, [employees]);

  const openShiftPicker = (day, updateFunc) => {
    setShiftPicker({ open: true, day, setFunc: updateFunc });
  };

  const selectShift = (label) => {
    if (!shiftPicker.setFunc || !shiftPicker.day) return;
    shiftPicker.setFunc((prev) => ({
      ...prev,
      [shiftPicker.day]: shiftTimes[label],
    }));
    setShiftPicker({ open: false, day: "", setFunc: null });
  };

  const clearShift = () => {
    shiftPicker.setFunc((prev) => {
      const updated = { ...prev };
      delete updated[shiftPicker.day];
      return updated;
    });
    setShiftPicker({ open: false, day: "", setFunc: null });
  };

  const addEmployee = () => {
    if (!name) return;
    setEmployees([
      ...employees,
      {
        name,
        availability: { ...availability },
        roles: { ...roles },
      },
    ]);
    setName("");
    setAvailability({});
    setRoles({ manager: false, insider: false, driver: false });
  };

  const deleteEmployee = (name) => {
    if (window.confirm(`Delete ${name}?`)) {
      setEmployees(employees.filter((e) => e.name !== name));
    }
  };

  const exportToExcel = () => {
    const exportData = employees.map((emp) => {
      const row = { Employee: emp.name };
      days.forEach((day) => {
        row[day] = emp.availability[day] || "";
      });
      return row;
    });

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Schedule");
    writeFile(wb, "schedule.xlsx");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Weekly Shift Scheduler</h1>

      {/* Form */}
      <div className="bg-white rounded-lg p-4 shadow mb-6">
        <input
          className="border p-2 mr-4"
          value={name}
          placeholder="Employee name"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mb-2 mt-2">
          <strong>Availability (click day to assign shift):</strong>
          <div className="flex flex-wrap gap-2 mt-1">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => openShiftPicker(day, setAvailability)}
                className={`px-2 py-1 border rounded ${
                  availability[day] ? "bg-blue-200" : "bg-gray-100"
                }`}
              >
                {day}{availability[day] ? `: ${availability[day]}` : ""}
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
                      {days.map((day) => (
                        <td key={day} className="border p-2 text-sm text-center">
                          {emp.availability[day] || ""}
                        </td>
                      ))}
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

      {/* Shift Picker Modal */}
      {shiftPicker.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-md w-[300px] text-center">
            <h2 className="text-lg font-semibold mb-4">Select shift for {shiftPicker.day}</h2>
            {Object.entries(shiftTimes).map(([label, time]) => (
              <button
                key={label}
                className="w-full text-left px-4 py-2 border rounded mb-2 hover:bg-gray-100"
                onClick={() => selectShift(label)}
              >
                {label} — <span className="text-sm text-gray-600">{time}</span>
              </button>
            ))}
            <button
              className="text-sm text-gray-500 mt-2 underline"
              onClick={clearShift}
            >
              Clear this day
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
