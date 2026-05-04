import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import axios from "axios";

const FHIR_BASE = "https://hapi-production-3f3b.up.railway.app/fhir";
const GEMINI_KEY = "AIzaSyAMroUbKJB-CbdIjD7JkETN-OpNpyDMZwo";
const GEMINI_MODEL = "gemini-2.5-flash-lite";

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}

async function getFHIR(path) {
  const res = await axios.get(`${FHIR_BASE}/${path}`);
  return res.data;
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [brief, setBrief] = useState("");
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [patientData, setPatientData] = useState(null);

  useEffect(() => {
    getFHIR("Patient?_count=50").then((data) => {
      const pts = data.entry?.map((e) => ({
        id: e.resource.id,
        name:
          e.resource.name?.[0]?.text ||
          `${e.resource.name?.[0]?.given?.[0]} ${e.resource.name?.[0]?.family}`,
        gender: e.resource.gender,
        birthDate: e.resource.birthDate,
      })) || [];
      setPatients(pts);
    });
  }, []);

  async function loadPatient(patient) {
    setSelectedPatient(patient);
    setBrief("");
    setAnswer("");
    setQuestion("");
    const [obs, meds, conds] = await Promise.all([
      getFHIR(`Observation?patient=${patient.id}&_count=20&_sort=-date`),
      getFHIR(`MedicationRequest?patient=${patient.id}&_count=20`),
      getFHIR(`Condition?patient=${patient.id}&_count=20`),
    ]);
    const data = {
      observations: obs.entry?.map((e) => ({
        code: e.resource.code?.text || e.resource.code?.coding?.[0]?.display,
        value: e.resource.valueQuantity?.value,
        unit: e.resource.valueQuantity?.unit,
        date: e.resource.effectiveDateTime,
      })) || [],
      medications: meds.entry?.map((e) => ({
        medication:
          e.resource.medicationCodeableConcept?.text ||
          e.resource.medicationCodeableConcept?.coding?.[0]?.display,
        status: e.resource.status,
      })) || [],
      conditions: conds.entry?.map((e) => ({
        condition: e.resource.code?.text || e.resource.code?.coding?.[0]?.display,
        status: e.resource.clinicalStatus?.coding?.[0]?.code,
      })) || [],
    };
    setPatientData(data);
  }

  async function generateBrief() {
    if (!selectedPatient || !patientData) return;
    setLoadingBrief(true);
    setBrief("");
    const prompt = `You are ARIA, an AI clinical decision support assistant.
Analyze this patient data and generate a concise ICU rounding brief.

Patient: ${selectedPatient.name}, ${selectedPatient.gender}, DOB: ${selectedPatient.birthDate}
Data: ${JSON.stringify(patientData, null, 2)}

Generate a structured rounding brief with:
1. PATIENT SUMMARY
2. VITAL SIGNS & ALERTS (flag abnormal values)
3. ACTIVE CONDITIONS
4. MEDICATIONS
5. CLINICAL RECOMMENDATIONS (2-3 actionable suggestions, not diagnoses)
6. WATCH LIST

Be concise and clinical. Flag critical values in CAPS.`;
    const result = await callGemini(prompt);
    setBrief(result);
    setLoadingBrief(false);
  }

  async function askQuestion() {
    if (!question || !patientData) return;
    setLoadingAnswer(true);
    const prompt = `You are ARIA, an AI clinical decision support assistant.
Patient: ${selectedPatient.name}
Data: ${JSON.stringify(patientData, null, 2)}
Physician question: ${question}
Answer concisely and clinically. Never diagnose — provide decision support only.`;
    const result = await callGemini(prompt);
    setAnswer(result);
    setLoadingAnswer(false);
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0" }}>
      {/* Sidebar */}
      <div style={{ width: 260, background: "#1e293b", borderRight: "1px solid #334155", overflowY: "auto", padding: 16 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8", margin: 0 }}>🏥 ARIA</h1>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>Rounding Intelligence Assistant</p>
        </div>
        <p style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Patients ({patients.length})</p>
        {patients.map((p) => (
          <div
            key={p.id}
            onClick={() => loadPatient(p)}
            style={{
              padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 4,
              background: selectedPatient?.id === p.id ? "#0ea5e9" : "transparent",
              color: selectedPatient?.id === p.id ? "#fff" : "#cbd5e1",
              transition: "all 0.15s"
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{p.gender} · {p.birthDate}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        {!selectedPatient ? (
          <div style={{ textAlign: "center", marginTop: 100 }}>
            <h2 style={{ color: "#38bdf8", fontSize: 28 }}>Welcome to ARIA</h2>
            <p style={{ color: "#64748b" }}>Select a patient from the sidebar to begin</p>
          </div>
        ) : (
          <>
            {/* Patient header */}
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24, border: "1px solid #334155" }}>
              <h2 style={{ margin: 0, fontSize: 22, color: "#f1f5f9" }}>{selectedPatient.name}</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>{selectedPatient.gender} · DOB: {selectedPatient.birthDate} · ID: {selectedPatient.id}</p>
              <button
                onClick={generateBrief}
                disabled={loadingBrief}
                style={{
                  marginTop: 16, padding: "10px 24px", background: "#0ea5e9", color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600
                }}
              >
                {loadingBrief ? "⏳ Generating..." : "⚡ Generate Rounding Brief"}
              </button>
            </div>

{/* NEWS2 Score Card */}
            {patientData && (
              <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "Conditions", value: patientData.conditions.length, color: "#f59e0b" },
                  { label: "Medications", value: patientData.medications.length, color: "#6366f1" },
                  { label: "Observations", value: patientData.observations.length, color: "#10b981" },
                  { label: "NEWS2 Risk", value: patientData.observations.length > 0 ? "LOW" : "N/A", color: "#ef4444" },
                ].map((stat) => (
                  <div key={stat.label} style={{
                    flex: 1, background: "#1e293b", borderRadius: 12, padding: 20,
                    border: `1px solid ${stat.color}33`, textAlign: "center"
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Rounding Brief */}
            {brief && (
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24, border: "1px solid #0ea5e9" }}>
                <h3 style={{ margin: "0 0 16px", color: "#38bdf8" }}>📋 ARIA Rounding Brief</h3>
                <div style={{ lineHeight: 1.7, fontSize: 14 }}>
                  <ReactMarkdown>{brief}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Q&A */}
            {patientData && (
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, border: "1px solid #334155" }}>
                <h3 style={{ margin: "0 0 16px", color: "#38bdf8" }}>💬 Ask ARIA</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                    placeholder="e.g. What are the main concerns for this patient?"
                    style={{
                      flex: 1, padding: "10px 14px", background: "#0f172a", border: "1px solid #334155",
                      borderRadius: 8, color: "#e2e8f0", fontSize: 14
                    }}
                  />
                  <button
                    onClick={askQuestion}
                    disabled={loadingAnswer}
                    style={{
                      padding: "10px 20px", background: "#0ea5e9", color: "#fff",
                      border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600
                    }}
                  >
                    {loadingAnswer ? "..." : "Ask"}
                  </button>
                </div>
                {answer && (
                  <div style={{ marginTop: 16, padding: 16, background: "#0f172a", borderRadius: 8, fontSize: 14, lineHeight: 1.7 }}>
                    <ReactMarkdown>{answer}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
