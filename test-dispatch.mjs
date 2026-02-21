const API = "http://localhost:3010/api";

async function test() {
  console.log("1. Creating task...");
  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Verification Task: Are you receiving this?", sessionKey: "agent:main:main" })
  });
  const data = await res.json();
  const taskId = data.taskId;
  console.log("Task ID:", taskId);

  console.log("2. Moving to in_progress (Dispatching)...");
  await fetch(`${API}/tasks/${taskId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_progress" })
  });
  
  // Get the sourceRunId
  const taskRes = await fetch(`${API}/tasks`);
  const tasks = await taskRes.json();
  const task = tasks.tasks.find(t => t.id === taskId);
  const runId = task.sourceRunId;
  console.log("Assigned sourceRunId:", runId);

  console.log("3. Waiting 15s for agent response...");
  await new Promise(r => setTimeout(r, 15000));

  console.log("4. Fetching events for this run...");
  const evRes = await fetch(`${API}/monitor/runs/${runId}/events`);
  const evData = await evRes.json();
  
  console.log(`Found ${evData.count} events.`);
  
  if (evData.events && evData.events.length > 0) {
    console.log("--- First 5 Events ---");
    evData.events.slice(0, 5).forEach((e, i) => {
      const text = (e.payload?.message?.content || e.payload?.message?.text || '').slice(0, 100).replace(/\n/g, ' ');
      console.log(`[${i}] ${e.kind}: ${text.trim() ? text : '<no text>'}`);
    });
    console.log("--- Last 5 Events ---");
    evData.events.slice(-5).forEach((e, i) => {
      const text = (e.payload?.message?.content || e.payload?.message?.text || '').slice(0, 100).replace(/\n/g, ' ');
      console.log(`[${evData.events.length - 5 + i}] ${e.kind}: ${text.trim() ? text : '<no text>'}`);
    });
  } else {
    console.log("ERROR: No events received from agent.");
  }
}

test().catch(console.error);
