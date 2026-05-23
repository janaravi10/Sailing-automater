function updateProgress(index, finalTxt, sailingLength, classType) {

    let elem = document.querySelector("#sailing" + index);
    if (index + 1 != sailingLength) {
        elem.setAttribute("aria-busy", true);
    }
    elem.classList.add(classType)
    elem.innerHTML = finalTxt;

    if (index != 0) {
        elem = document.querySelector("#sailing" + (index - 1));
        elem.removeAttribute("aria-busy");
    }
}


function showStatus(selector, finalTxt, type, loading) {
    let elem = document.querySelector(selector);
    elem.setAttribute("aria-busy", true);
    elem.style.display = "inline";
    elem.className = "";
    elem.classList.add(type);
    elem.setAttribute("aria-busy", loading);
    elem.innerHTML = finalTxt;
}
//


document.addEventListener("click", async function (eve) {
    let shipsoftTab, dialog = document.querySelector("dialog#alert_dialog"),
        { ssUpdateIndex, ssList } = await chrome.storage.local.get(["ssUpdateIndex", "ssList"])

    // update checkbox when checked.
    let tar = eve.target;
    if (tar.id === "coloadCheckbox" || tar.id === "consolCheckbox") {
        let res = await chrome.storage.local.get("consolMode")
        res = res.consolMode || {};
        res[tar.name] = tar.checked;
        if (!res.consol && !res.coload) {
            eve.preventDefault();
            eve.target.checked = true;
            showPopup("#show_alert", "Select any one mode!", 2000, "danger");
            return;
        }
        await chrome.storage.local.set({ consolMode: res })
    } else if (tar.id === "downloadTemplate") {
        downloadExcel()
        tar.closest("dialog").setAttribute("open", false);
    } else if (tar.id === "startTutorial") {
        dialog = document.querySelector("dialog#tutorial");
        dialog.setAttribute("open", true);
    } else if (tar.id === "tutorialClose") {
        tar.closest("dialog").setAttribute("open", false);
    }

    if (eve.target.id === "dialog_sec") {
        dialog.setAttribute("open", false);

        updateProgress(ssUpdateIndex, "sailing skipped!", ssList.length, "danger");
        if (ssUpdateIndex === ssList.length + 1) {
            // this is the end.
            await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
        } else {
            await chrome.storage.local.set({ extensionStatus: "RUNNING", ssUpdateIndex: ssUpdateIndex + 1 });
        }

        shipsoftTab = await chrome.tabs.query({ url: "https://cs.shipsoft.co/freight_forwarding*" });
        chrome.tabs.sendMessage(shipsoftTab[0].id, { action: "NEXT_SAILING" }, function (response) {

        });
        dialog.setAttribute("open", false);
    } else if (eve.target.id === "dialog_pry") {
        dialog.setAttribute("open", false);

        shipsoftTab = await chrome.tabs.query({ url: "https://cs.shipsoft.co/freight_forwarding*" });
        chrome.tabs.sendMessage(shipsoftTab[0].id, { action: "CREATE_VESSEL" }, function (response) {

        });

    }
})
chrome.storage.local.onChanged.addListener(function (change) {
    if (change.extensionStatus) {
        const ssUpdateBtn = document.getElementById("ssUpdate");
        let newValue = change.extensionStatus.newValue;
        if (newValue === "ENDED") {
            ssUpdateBtn.innerText = "RESTART";
        } else if (newValue === "STOPPED") {
            ssUpdateBtn.innerText = "RESUME";
        } else if (newValue === "RUNNING") {
            ssUpdateBtn.innerText = "PAUSE";
        }
    }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 

    if (message.action === 'VESSEL_NOT_AVAILABLE') {
        let header = document.querySelector("#dialog_header"), desc = document.querySelector("#dialog_desc"),
            sec_btn = document.querySelector("#dialog_sec"), pry_btn = document.querySelector("#dialog_pry");

        header.innerHTML = "Vessel Not available!";
        desc.innerHTML = "Do you want to create \"" + message.VESSEL + "\" vessel in system ?";
        let dialog = document.querySelector("dialog");
        dialog.setAttribute("open", true);

    } else if (message.action === "UPDATE_PROGRESS") {
        updateProgress(message.ssUpdateIndex, message.updateText, message.sailingLength, message.classType);
    } else if (message.action === "UPDATE_STATUS") {
        showStatus("#show_alert", message.updateText, message.type, message.loading
        );
    } else if (message.action === "SCHEDULE_DONE") {
        showPopup("#show_alert", "Schedule completed!", 1000, "non_danger");
    }
});


window.addEventListener("load", start);

async function start() {

    // 1. Get the file input element
    const ssLoadBtn = document.getElementById('ssLoad');
    ssLoadBtn.addEventListener('click', sheetParsing);

    // update sailing button event listener
    const ssUpdateBtn = document.getElementById("ssUpdate");
    ssUpdateBtn.addEventListener("click", startUpdateSailing)

    const connectToShipSoft = document.getElementById("connectToShipSoft");
    connectToShipSoft.addEventListener("click", startConnection);
    ////
    let { ssList, extensionStatus } = await chrome.storage.local.get(["ssList", "extensionStatus"]);

    //
    if (ssList && ssList.length) {
        ssUpdateBtn.removeAttribute("disabled");
    }
    ssList && formatAsTable(ssList)

    /// set 
    let ssInput = document.querySelector("#ssInput");
    ssInput.addEventListener("change", function (eve) {
        const file = event.target.files[0];
        let loadBtn = document.querySelector("#ssLoad");
        if (file) {
            const fileName = file.name.toLowerCase();
            if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                loadBtn.removeAttribute("disabled");
            } else {
                loadBtn.setAttribute("disabled", true);
                showPopup("#show_alert", "Unsupported file selected!", 2000, "danger");
            }

        }
    })
    //

    startConnection();

    let res = await chrome.storage.local.get("consolMode");
    if (res.consolMode) {
        updateConsolCheckbox(res.consolMode);
    } else {
        await chrome.storage.local.set({ consolMode: { coload: true, consol: false } });
        updateConsolCheckbox({ coload: true, consol: false });
    }
}


function updateConsolCheckbox(consolMode) {
    let coloadCheckbox = document.querySelector("#coloadCheckbox"), consolCheckbox = document.querySelector("#consolCheckbox");
    coloadCheckbox.checked = consolMode.coload;
    consolCheckbox.checked = consolMode.consol;
}

function showPopup(selector, text, time, type) {
    let elem = document.querySelector(selector);
    elem.style.display = "inline";
    elem.innerHTML = text;
    elem.className = "";
    elem.classList.add(type);
    setTimeout(() => {
        elem.style.display = "none";
    }, time);
}

function changeBtnStatus(selector, attribute, attrStatus, text) {
    let btn = document.querySelector(selector);
    btn.setAttribute(attribute, attrStatus);
    btn.innerText = text;

}
async function startConnection(eve) {
    let shipsoftTab = await chrome.tabs.query({ url: "https://cs.shipsoft.co/freight_forwarding*" }), createdTab,
        { extensionStatus, ssList } = await chrome.storage.local.get(["extensionStatus", "ssList"]);

    if (shipsoftTab.length) {
        try {
            let loadedTab = shipsoftTab[0];

            if (loadedTab.url === "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {
                showStatus("#show_alert", "PLEASE LOGIN TO SHIPSOFT", "danger", true);

                chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo) {
                    // Ensure we are only responding to the tab we just created
                    if (tabId === loadedTab.id && changeInfo.status === 'complete') {
                        let loadedTab = await chrome.tabs.get(tabId);
                        if (loadedTab.url === "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {
                            showStatus("#show_alert", "PLEASE LOGIN TO SHIPSOFT", "danger", true);

                        } else if (changeInfo.url !== "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {
                            showPopup("#show_alert", "LOGGED IN TO SHIPSOFT", 3000, "non_danger");
                            // after clicking connect button  sending message to content script.
                            const response = await chrome.tabs.sendMessage(shipsoftTab[0].id, { checkConnection: true });

                            if (response.status === "SUCCESS") {
                                showPopup("#show_alert", response.msg, 3000, "non_danger");
                                changeBtnStatus("#connectToShipSoft", "disabled", true, "connected");
                            }
                            chrome.tabs.onUpdated.removeListener(listener);
                        }
                    }
                });
            } else if (loadedTab.url !== "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {

                // after clicking connect button  sending message to content script.
                const response = await chrome.tabs.sendMessage(shipsoftTab[0].id, { checkConnection: true });

                if (response.status === "SUCCESS") {
                    showPopup("#show_alert", response.msg, 3000, "non_danger");
                    changeBtnStatus("#connectToShipSoft", "disabled", true, "connected");
                }
                showPopup("#show_alert", "LOGGED IN TO SHIPSOFT", 3000, "non_danger");

            }

            // TODO: Do something with the response.
            return { success: true };
        } catch (error) {
            if (error == "Error: Could not establish connection. Receiving end does not exist.") {
                chrome.tabs.reload(shipsoftTab[0].id);
                chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo) {
                    // Ensure we are only responding to the tab we just created
                    if (tabId === shipsoftTab[0].id && changeInfo.status === 'complete') {
                        let loadedTab = await chrome.tabs.get(tabId);
                        if (loadedTab.url === "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {
                            showStatus("#show_alert", "PLEASE LOGIN TO SHIPSOFT", "danger", true);

                        } else if (changeInfo.url !== "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {
                            showPopup("#show_alert", "LOGGED IN TO SHIPSOFT", 3000, "non_danger");
                            // after clicking connect button  sending message to content script.
                            const response = await chrome.tabs.sendMessage(shipsoftTab[0].id, { checkConnection: true });
                            if (response.status === "SUCCESS") {
                                showPopup("#show_alert", response.msg, 3000, "non_danger");
                                changeBtnStatus("#connectToShipSoft", "disabled", true, "connected");
                            }
                            chrome.tabs.onUpdated.removeListener(listener);
                        }
                    }
                });


            } else {
                console.log(error);
                showStatus("#show_alert", error, "danger", false);
            }

        }

    } else {
        createdTab = await chrome.tabs.create({ url: "https://cs.shipsoft.co/freight_forwarding/#/homepage", active: false });
        chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo) {
            if (changeInfo.status === "complete" && tabId === createdTab.id) {

                let loadedTab = await chrome.tabs.get(tabId);

                if (loadedTab.url === "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {

                    showStatus("#show_alert", "PLEASE LOGIN TO SHIPSOFT", "danger", true);

                } else if (loadedTab.url !== "https://cs.shipsoft.co/freight_forwarding/#/auth/login") {

                    showPopup("#show_alert", "LOGGED IN TO SHIPSOFT", 3000, "non_danger");
                    // after clicking connect button  sending message to content script.
                    const response = await chrome.tabs.sendMessage(tabId, { checkConnection: true });
                    if (response.status === "SUCCESS") {
                        showPopup("#show_alert", response.msg, 3000, "non_danger");
                        changeBtnStatus("#connectToShipSoft", "disabled", true, "connected");
                    }
                    chrome.tabs.onUpdated.removeListener(listener);
                }
            }

        });
    }

}

async function startUpdateSailing(eve) {
    let shipsoftTab = await chrome.tabs.query({ url: "https://cs.shipsoft.co/freight_forwarding*" }),
        { extensionStatus, ssList } = await chrome.storage.local.get(["extensionStatus", "ssList"]), updateBtn = eve.target;

    if (!ssList || !ssList.length) {
        showPopup("#show_alert", "Please upload vessel schedule", 2000, "danger");
        return;
    }

    if (updateBtn.innerText === "UPDATE SAILING"
        || updateBtn.innerText === "RESUME" ||
        updateBtn.innerText === "RESTART") {
        if (updateBtn.innerText !== "RESUME") {
            await chrome.storage.local.set({ extensionStatus: "RUNNING", ssUpdateIndex: 0 });
        } else {
            await chrome.storage.local.set({ extensionStatus: "RUNNING" });
        }

        updateBtn.innerText = "PAUSE";
    } else {
        updateBtn.innerText = "RESUME";
        await chrome.storage.local.set({ extensionStatus: "STOPPED" });
        return;
    }
    /// check if shipment table is already present 
    // if present send message if no received reply then catch and reload the tab
    chrome.tabs.sendMessage(shipsoftTab[0].id, { startUpdateSailing: true })
}

async function sheetParsing(e) {

    let ssInput = document.getElementById("ssInput"), { carrierList } =
        await chrome.storage.local.get("carrierList");
    const file = ssInput.files;
    if (file.length == 0) {
        showStatus("#show_alert", "Please upload file first", "danger", false
        );
        return;
    };

    // 2. Initialize FileReader
    const reader = new FileReader();

    reader.onload = async (evt) => {
        // 3. Convert the result to a Uint8Array
        const data = new Uint8Array(evt.target.result);

        // 4. Parse the data with SheetJS
        const workbook = XLSX.read(data, { type: 'array' });

        // 5. Work with the workbook (e.g., get the first sheet)
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Optional: Convert sheet to JSON
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (!json.length) {
            showStatus("#show_alert", "No sailing details inside file.", "danger", false);
            return;
        }
        let formatedJson = formatToProperDate(json);
        formatedJson = formatedJson.map((sailing) => {
            let formatedSailing = {},
                columnValues = Object.keys(sailing);
            columnValues.forEach((attr) => {
                if (attr === "CARRIER") {
                    formatedSailing[attr] = (searchCarrier(sailing[attr], carrierList)[0] || {})
                } else {
                    formatedSailing[attr] = String(sailing[attr]).trim()
                }

            })
            return formatedSailing;
        })

        formatAsTable(formatedJson);


        const ssUpdateBtn = document.getElementById("ssUpdate");
        ssUpdateBtn.removeAttribute("disabled");

        await chrome.storage.local.set({ ssList: formatedJson });

    };

    reader.readAsArrayBuffer(file[0]);

}
// function to conver the date into proper format.

function formatToProperDate(ssList) {
    let formatedSSList = [], columnValues = Object.keys(ssList[0]);

    ssList.forEach(sailing => {
        let formatedSailing = {};
        columnValues.forEach(attr => {
            if (["ETA_POL", "ETA_POD", "ETD_POL", "ETA_CUTOFF"].find(elem => attr === elem)) {
                // Excel serial date: 46156 (May 10, 2026)
                let excelDate = sailing[attr];

                // Excel base date (Dec 30, 1899) to JavaScript epoch (Jan 1, 1970) is 25569 days
                // Calculate: (serialNumber - 25569) * millisecondsInADay
                const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                const day = String(jsDate.getDate()).padStart(2, '0');
                const month = jsDate.toLocaleString('en-US', { month: 'short' }).toLowerCase();
                const year = jsDate.getFullYear();
                const formattedDate = `${day}-${month}-${year}`;
                formatedSailing[attr] = formattedDate;
            } else {

                formatedSailing[attr] = sailing[attr]
            }

        })
        formatedSSList.push(formatedSailing);
    })

    return formatedSSList;
}
function formatAsTable(vesselList) {

    let columnValues = Object.keys(vesselList[0]), table = `<table><thead><tr>`;
    columnValues = sortList(columnValues);
    columnValues.forEach(e => {
        table += `<th scope="col">${e.toUpperCase()}</th>`;
    })
    table += "<th scope='col'>status</th></tr></thead><tbody>";

    vesselList.forEach((sailing, index) => {
        table += "<tr>"
        columnValues.forEach(attr => {
            if (attr === "CARRIER") {
                table += '<th scope="row">' + sailing[attr].text || "" + "</th>";
                return;
            }
            table += '<th scope="row">' + sailing[attr].toUpperCase() + "</th>";


        })
        table += "<th scope='row' id='sailing" + index + "'>Pending..</th></tr>"
    })

    table += "</tbody></table>";
    let tableContainer = document.getElementById("ssList")
    tableContainer.innerHTML = table;
}


function sortList(actualColumns) {
    const target = actualColumns;
    const order = ["VESSEL", 'VOYAGE', "ETA_CUTOFF", 'ETA_POL', 'ETD_POL', 'POD_TEXT', "POD_CODE", "ETA_POD"];

    // Build a map for O(1) lookups
    const orderMap = {};
    order.forEach((val, index) => orderMap[val] = index);

    target.sort((a, b) => {
        const indexA = orderMap[a] ?? Infinity; // Put missing items at the end
        const indexB = orderMap[b] ?? Infinity;
        return indexA - indexB;
    });
    return target;

}

function searchCarrier(searchTerm, carrierDB) {
    if (!searchTerm) return [];
    let matches = [];
    while (searchTerm.length > 4) {
        matches = carrierDB.filter(carrier => carrier.text.includes(searchTerm));
        if (matches.length > 0) break; // Stop loop if match found
        searchTerm = searchTerm.slice(0, -2); // Trim last character
    }
    return matches;
}




function downloadExcel() {
    // Sample data
    const data = [
        {
            VESSEL: "",
            VOYAGE: "",
            PORT_CODE: "",
            PORT_TEXT: "",
            ETA_CUTOFF: "",
            ETA_POL: "",
            ETD_POL: "",
            ETA_POD: "",
            CARRIER: ""

        },

    ];

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);


    // Auto-fit column width
    const columnWidths = Object.keys(data[0]).map(key => {
        const maxLength = Math.max(
            key.length,
            ...data.map(row => String(row[key] || "").length)
        );

        return { wch: maxLength + 2 }; // extra padding
    });

    worksheet['!cols'] = columnWidths;
    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Append worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vessel Schedule");

    // Download Excel file
    XLSX.writeFile(workbook, "Vessel_Schedule.xlsx");
}