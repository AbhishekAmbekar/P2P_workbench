/* Item guides: what an item is, the specs that matter and why, and what to ask the supplier, in plain words for a buyer
 * who is not the engineer. Written content for the demo items; items without a guide still get a page with their history
 * and lessons. Drawings are simplified schematics, not photos, so they cannot show the wrong part.
 * Read by view-items.js. Plain data, no logic. */
(function () {
  "use strict";
  var t = function (x, y, s, a) { return '<text x="' + x + '" y="' + y + '" font-size="13" fill="#111827" font-family="Inter, sans-serif"' + (a ? ' text-anchor="' + a + '"' : "") + ">" + s + "</text>"; };

  var SEAL = '<svg viewBox="0 0 560 230" role="img" aria-label="Simplified cross section of a mechanical seal on a pump shaft: gland plate, stationary face, rotating face, spring, collar, O-rings and shaft">' +
    '<rect x="20" y="104" width="520" height="22" rx="3" fill="#e5e7eb" stroke="#6b7280"/>' +
    '<rect x="70" y="40" width="40" height="64" fill="#c7d2fe" stroke="#4338ca"/>' +
    '<rect x="110" y="56" width="22" height="48" fill="#a5b4fc" stroke="#4338ca"/>' +
    '<rect x="132" y="56" width="22" height="48" fill="#fdba74" stroke="#c2410c"/>' +
    '<path d="M160 64 l10 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l10 -8" fill="none" stroke="#15803d" stroke-width="3"/>' +
    '<rect x="230" y="56" width="26" height="48" fill="#e5e7eb" stroke="#6b7280"/>' +
    '<circle cx="121" cy="98" r="5" fill="#111827"/><circle cx="143" cy="98" r="5" fill="#111827"/>' +
    t(90, 30, "Gland plate", "middle") + '<line x1="121" y1="150" x2="121" y2="104" stroke="#4338ca"/>' + t(121, 166, "Stationary face", "middle") +
    '<line x1="143" y1="190" x2="143" y2="104" stroke="#c2410c"/>' + t(143, 206, "Rotating face", "middle") + t(195, 44, "Spring", "middle") +
    t(243, 44, "Collar", "middle") + '<line x1="300" y1="80" x2="148" y2="98" stroke="#111827"/>' + t(306, 84, "O-rings (rubber)") + t(420, 145, "Shaft", "middle") +
    t(40, 226, "Pump side") + t(520, 226, "Motor side", "end") + "</svg>";

  var BEARING = '<svg viewBox="0 0 560 230" role="img" aria-label="Simplified cross section of a sealed ball bearing: outer ring, inner ring, balls, seals and bore">' +
    '<rect x="150" y="30" width="120" height="34" rx="4" fill="#c7d2fe" stroke="#4338ca"/>' +
    '<rect x="150" y="166" width="120" height="34" rx="4" fill="#c7d2fe" stroke="#4338ca"/>' +
    '<rect x="150" y="70" width="120" height="22" rx="3" fill="#fdba74" stroke="#c2410c"/>' +
    '<rect x="150" y="138" width="120" height="22" rx="3" fill="#fdba74" stroke="#c2410c"/>' +
    '<rect x="150" y="92" width="120" height="46" fill="#f9fafb" stroke="#9ca3af" stroke-dasharray="4 3"/>' +
    '<rect x="146" y="40" width="6" height="40" fill="#111827"/><rect x="268" y="40" width="6" height="40" fill="#111827"/>' +
    '<rect x="146" y="150" width="6" height="40" fill="#111827"/><rect x="268" y="150" width="6" height="40" fill="#111827"/>' +
    '<circle cx="210" cy="64" r="14" fill="#9ca3af" stroke="#374151"/><circle cx="210" cy="166" r="14" fill="#9ca3af" stroke="#374151"/>' +
    '<line x1="300" y1="44" x2="270" y2="44" stroke="#4338ca"/>' + t(306, 48, "Outer ring, 52 mm across") +
    '<line x1="300" y1="80" x2="270" y2="80" stroke="#c2410c"/>' + t(306, 84, "Inner ring, fits on the shaft") +
    '<line x1="300" y1="116" x2="270" y2="116" stroke="#6b7280"/>' + t(306, 120, "Bore, 25 mm (the shaft goes here)") +
    '<line x1="300" y1="186" x2="274" y2="186" stroke="#111827"/>' + t(306, 190, "Rubber seal each side (the 2RS)") +
    '<line x1="120" y1="64" x2="196" y2="64" stroke="#374151"/>' + t(114, 68, "Balls", "end") +
    t(210, 222, "Width 15 mm", "middle") + "</svg>";

  var HOSE = '<svg viewBox="0 0 560 200" role="img" aria-label="Simplified hydraulic hose assembly: fitting, crimped ferrule, reinforced hose and the overall length">' +
    '<rect x="40" y="82" width="56" height="36" rx="4" fill="#c7d2fe" stroke="#4338ca"/>' +
    '<rect x="96" y="76" width="54" height="48" rx="4" fill="#fdba74" stroke="#c2410c"/>' +
    '<rect x="150" y="84" width="260" height="32" rx="6" fill="#374151"/>' +
    '<path d="M160 90 l20 20 M180 90 l20 20 M200 90 l20 20 M220 90 l20 20 M240 90 l20 20 M260 90 l20 20 M280 90 l20 20 M300 90 l20 20 M320 90 l20 20 M340 90 l20 20 M360 90 l20 20 M380 90 l20 20" stroke="#9ca3af"/>' +
    '<rect x="410" y="76" width="54" height="48" rx="4" fill="#fdba74" stroke="#c2410c"/>' +
    '<rect x="464" y="82" width="56" height="36" rx="4" fill="#c7d2fe" stroke="#4338ca"/>' +
    t(68, 66, "Fitting (thread type)", "middle") + t(123, 146, "Crimped ferrule", "middle") + t(280, 70, "Hose with wire braid", "middle") +
    '<line x1="40" y1="168" x2="520" y2="168" stroke="#111827"/><line x1="40" y1="160" x2="40" y2="176" stroke="#111827"/><line x1="520" y1="160" x2="520" y2="176" stroke="#111827"/>' +
    t(280, 192, "Overall length, end of fitting to end of fitting", "middle") + "</svg>";

  window.P2P_ITEM_GUIDES = {
    "MR-203": {
      what: "A mechanical seal stops the pumped liquid leaking out where the shaft leaves the pump. Two very flat faces press together: one turns with the shaft, one stays still. A thin film of the liquid between them seals and cools them. The kit holds the faces, springs and O-rings to rebuild the seal.",
      where: "Pumps for water, coolant and process liquids. If the seal fails, the pump has to stop.",
      drawing: SEAL,
      specs: [["Shaft diameter", "The seal must match it exactly. Off by 1 mm and it will not fit."], ["Liquid pumped", "Decides the O-ring and face materials."],
        ["Temperature and pressure", "O-rings rated too low harden and leak."], ["Face materials", "Silicon carbide against carbon is common. Harder faces last longer with grit in the liquid."],
        ["Pump make and model", "From the nameplate. The surest way to an exact match."]],
      ask: ["Is it an exact replacement for the seal now fitted, or an equivalent? If equivalent, send the drawing.", "What O-ring material, and its rated temperature?",
        "Lead time for the full kit, not only the faces.", "Can you hold a spare kit for us?"]
    },
    "MR-402": {
      what: "A ball bearing lets a shaft turn with little friction. Size 6205 is a standard size: 25 mm bore, 52 mm outside, 15 mm wide. The 2RS at the end of a full part number means a rubber seal on each side, which keeps grease in and dirt out.",
      where: "Motors, conveyors, fans and gearboxes. A failed bearing usually stops the machine it is in.",
      drawing: BEARING,
      specs: [["Size number", "6205 sets the bore, outside size and width. Every maker uses the same number."], ["Seals or shields", "2RS is rubber seals, ZZ is metal shields. Seals keep dirt out better; shields run cooler at speed."],
        ["Internal clearance", "C3 has a little more room inside, for hot running. Check what is fitted now."], ["Maker", "Bearings are a common target for counterfeits. Buy from the maker or an authorised distributor."]],
      ask: ["Is it from the maker or an authorised distributor?", "Seals (2RS) or shields (ZZ), and which clearance?", "Is it in stock, and how many?"]
    },
    "MR-401": {
      what: "A hydraulic hose assembly carries oil under pressure between parts of a machine. It is a reinforced hose with a fitting crimped on each end. The assembly is made to a length and fitting type, so it must match the one it replaces.",
      where: "Presses, lifting equipment, mobile plant and any machine with hydraulic cylinders or motors.",
      drawing: HOSE,
      specs: [["Working pressure", "The hose must be rated above the system pressure. A burst hose sprays hot oil."], ["Fitting type on each end", "Threads that look alike can differ. A wrong fitting leaks or will not connect."],
        ["Overall length", "Measured end of fitting to end of fitting. Too short and it pulls; too long and it rubs."], ["Inside size", "Here 1 inch. It sets how much oil flows."],
        ["Temperature and fluid", "The hose rubber must suit the oil and its temperature."]],
      ask: ["What hose standard and working pressure is it rated to?", "Confirm both fitting types and the overall length against our old hose.", "Is it pressure tested before it ships?"]
    },
    "SV-502": {
      what: "A mobile crane with its own operator, hired by the day to lift heavy items, such as a pump or a heat exchanger, in and out.",
      where: "Overhauls, installations and shutdowns, whenever an item is too heavy for the cranes already on site.",
      drawing: null,
      specs: [["Lift weight", "The heaviest item, plus slings and lifting gear."], ["Reach", "How far from the crane the load must go. A crane lifts much less at long reach."],
        ["Ground", "Soft or unpaved ground needs mats under the outriggers."], ["Access and space", "The crane must fit through the gate and set up near the lift."],
        ["Lift plan", "Most sites need one before a heavy lift, agreed with the supplier."]],
      ask: ["Is the operator certified for this crane?", "Who supplies the slings and the rigger?", "Do you bring outrigger mats?", "What is the minimum charge, and what if the lift is delayed on the day?"]
    },
    "SV-501": {
      what: "Skilled maintenance technicians from a contractor, paid by the hour, to repair, overhaul or install equipment alongside the site team.",
      where: "Overhauls, shutdowns and breakdowns, when the site team needs more hands or a skill it does not have.",
      drawing: null,
      specs: [["Trade and skill", "Fitter, electrician or welder. Say which, and any special skill."], ["Hours and shift", "Normal hours, nights or weekends. Rates often differ."],
        ["Certifications", "Some work needs certified people, such as welding to a code or working at height."], ["Timesheets", "Hours are paid from signed timesheets, checked against the site log."]],
      ask: ["What are the rates for overtime, nights and weekends?", "Are the technicians trained for our site safety rules and permits?", "Who signs the timesheet on our side?"]
    },
    "SV-505": {
      what: "Checking gauges and instruments against a known reference and adjusting them, so their readings can be trusted. Each instrument gets a certificate.",
      where: "Pressure gauges, thermometers, scales and test equipment used for quality checks or safety.",
      drawing: null,
      specs: [["Traceability", "The lab's references must trace back to national standards."], ["Accreditation", "A lab accredited for the kind of instrument is the usual requirement."],
        ["Before and after readings", "As found and as left readings show whether past results were affected."], ["Turnaround", "How long instruments are away, and whether spares are needed meanwhile."]],
      ask: ["Is the lab accredited for these instruments?", "Will certificates show readings before and after adjustment?", "Turnaround time, and can you calibrate on site?"]
    },
    "PK-102": {
      what: "Plastic film in layers, on a roll, used to pack products that touch food. The layers give strength and keep air and moisture out.",
      where: "Packing lines that wrap or seal food products.",
      drawing: null,
      specs: [["Layer structure", "The materials and their order decide strength and how well it seals."], ["Thickness", "Too thin tears or lets air in; too thick may not seal on the machine."],
        ["Width and core size", "Must fit the packing machine."], ["Food contact approval", "A declaration that the film is safe to touch food is required."], ["Seal temperature", "Must suit the packing machine's settings."]],
      ask: ["Send the food contact declaration and a test report for each lot.", "What thickness tolerance do you hold?", "Same structure and supplier of raw film as the last order?"]
    },
    "CP-104": {
      what: "An aluminum part machined from solid to a drawing, used as the case or body of a product.",
      where: "Product builds and assemblies, where it must fit other parts exactly.",
      drawing: null,
      specs: [["Drawing and revision", "The supplier must machine to the latest revision."], ["Alloy and temper", "Sets strength and how it machines."],
        ["Tolerances", "Tight tolerances cost more and take longer."], ["Finish", "Anodizing or coating, and its color, change cost and lead time."],
        ["First article inspection", "A full check of the first parts before the rest are made."]],
      ask: ["Which drawing revision are you quoting?", "Do you include a material certificate and first article inspection report?", "Lead time with the finish included?"]
    },
    "CP-202": {
      what: "A printed circuit board with its parts fitted, that controls a motor. It is built to a drawing and a parts list, so the revision matters.",
      where: "Machines and products with electric motors.",
      drawing: null,
      specs: [["Drawing and parts list revision", "A board built to an old revision may miss a change, such as an added fuse."], ["Workmanship standard", "The quality class the board is built and inspected to."],
        ["Coating", "A protective coating for damp or dusty places."], ["Testing", "A function test of each board before shipping."], ["Parts at risk", "Parts that are hard to get or ending production."]],
      ask: ["Which revision will you build? Quote it on the offer.", "Is each board tested, and do you send the results?", "Any parts on the list with long lead times or ending production?"]
    },
    "RM-101": {
      what: "Aluminum pushed through a shaped die to make a long profile with a fixed cross section, then cut to length.",
      where: "Frames, rails and structures, and parts that are machined further.",
      drawing: null,
      specs: [["Profile or die number", "Identifies the exact shape."], ["Alloy and temper", "Sets strength and finish."], ["Length and tolerance", "Cut length and how straight it must be."],
        ["Finish", "Mill finish, anodized or coated."], ["Mill certificate", "Proves the alloy and its properties for each lot."]],
      ask: ["Is the die yours or ours, and who pays for a new one?", "Mill certificate with each lot?", "How are profiles packed so they arrive straight and unscratched?"]
    }
  };
})();
