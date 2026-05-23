async function getVessel(sendResponse) {

    try {

        let response = await fetch('https://cs.shipsoft.co/shipsoft_dev/angular_accounts_controller/get_common_lov2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: `
      SELECT 
        MVSL_NAME NAME,
        MVSL_CODE CODE,
        MVSL_STATUS STATUS,
        MVSL_RID RID
        FROM MVSL_VESSEL
        WHERE UPPER(MVSL_STATUS) = 'ACTIVE' AND MVSL_MCPY = 54 ORDER BY 1
    `
            })
        });
        response = await response.json();

        if (response.common_lov) {
            const today = new Date().toLocaleDateString('en-US')
            await chrome.storage.local.set({ vesselList: response.common_lov, lastUpdated: today });
            sendResponse && sendResponse({ status: "success", result: response });
            return { status: "success" };
        } else {
            sendResponse && sendResponse({ status: "error", result: response });
            return { status: "error" };
        }
    }
    catch (error) {
        sendResponse && sendResponse({ status: "error", result: error });
        return { status: "error" };

    }


}

async function getCarrierList(sendResponse) {

    try {

        let response = await fetch('https://cs.shipsoft.co/shipsoft_dev/angular_accounts_controller/get_common_lov', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: `select orgn_name  NAME,orgn_code  CODE,orgn_status  STATUS,orgn_rid  RID \tfrom orgn_organization\twhere orgn_mcpy = 54 and upper(orgn_status)='ACTIVE' and orgn_is_shippingline ='Y'\tORDER BY 1`
            })
        });
        response = await response.json();
        if (response.common_lov) {
            await chrome.storage.local.set({ carrierList: response.common_lov });
            sendResponse && sendResponse({ status: "success", result: response });
            return { status: "success" };
        } else {
            sendResponse && sendResponse({ status: "error", result: response });
            return { status: "error" };
        }
    }
    catch (error) {
        sendResponse && sendResponse({ status: "error", result: error });
        return { status: "error" };

    }


}


async function getPOD(sendResponse) {
    try {

        let response = await
            fetch("https://cs.shipsoft.co/shipsoft_dev/angular_accounts_controller/get_orgn_dest", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ session: JSON.parse(localStorage.getItem("ffsession")) })
            }); response = await response.json();

        const today = new Date().toLocaleDateString('en-US')
        await chrome.storage.local.set({ podList: response });
        sendResponse && sendResponse({ status: "success", result: response });
        return { status: "success", result: response };

    } catch (error) {
        sendResponse && sendResponse({ status: "error", result: error });
        return { status: "error", result: error };
    }
}

async function fetchRequiredData() {
    let lastUpdated = await chrome.storage.local.get("lastUpdated"), today = new Date(),
        isTodayDate;

    lastUpdated = lastUpdated.lastUpdated ? new Date(lastUpdated.lastUpdated) : false;
    if (lastUpdated) {
        isTodayDate = lastUpdated.getDate() === today.getDate() &&
            lastUpdated.getMonth() === today.getMonth() &&
            lastUpdated.getFullYear() === today.getFullYear();
    }

    if (!lastUpdated || !isTodayDate) {
        // send status message for popup
        await chrome.runtime.sendMessage({ action: "UPDATE_STATUS", updateText: "Fetching vessel list..", type: "non_danger", loading: true });
        // get
        let vesselUpdate = await getVessel(), podUpdate, carrierDB = await getCarrierList();
        if (vesselUpdate.status === "error") {

            return { status: "ERROR", msg: "Unable to fetch vessel List" };
        }
        if (carrierDB.status === "error") {
            await chrome.runtime.sendMessage({ action: "UPDATE_STATUS", updateText: "Unable to fetch carrier list", type: "danger", loading: false });
            return { status: "ERROR", msg: "Unable to fetch carrier list" };
        }

        await chrome.runtime.sendMessage({ action: "UPDATE_STATUS", updateText: "Fetching POD list!", type: "non_danger", loading: true });
        podUpdate = await getPOD();
        if (podUpdate.status === "error") {
            await chrome.runtime.sendMessage({ action: "UPDATE_STATUS", updateText: "Unable to update POD list!", type: "danger", loading: false });
            return { status: "ERROR", msg: "Unable to update POD List" };
        }

        return { status: "SUCCESS", msg: "Latest details Updated." }
    } else {
        return { status: "SUCCESS", msg: "Latest details Updated." }
    }

}
// content_script.js
chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
    if (request.checkConnection) {
        let fetchResult = await fetchRequiredData();
        sendResponse && sendResponse(fetchResult);

    } else if (request.startUpdateSailing) {
        // set index for running.
        await chrome.runtime.sendMessage({ action: "UPDATE_STATUS", updateText: "Updating sailing schedule..", type: "non_danger", loading: true });
        await chrome.storage.local.set({ extensionStatus: "RUNNING", shipsoftSailing: [] });
        ssUpdating();
    } else if (request.action === "CREATE_VESSEL") {
        createNewVessel();
    } else if (request.action === "NEXT_SAILING") {
        ssUpdating();
    }
    // Return true if you want to send a response asynchronously
    return true;
});

/// 
async function ssUpdating() {
    let { ssList, shipsoftSailing, ssUpdateIndex, extensionStatus } = await chrome.storage.local.get(["ssList", "extensionStatus", "shipsoftSailing", "ssUpdateIndex"]),
        isVesselInSS;

    if (!ssUpdateIndex) {
        // if index is undefined or 0 // reset value to zero.
        await chrome.storage.local.set({ ssUpdateIndex: 0 });
        ssUpdateIndex = 0;
    }

    if (shipsoftSailing && shipsoftSailing.length) {
        isVesselInSS = shipsoftSailing.find(element => ssList[ssUpdateIndex].POD_TEXT === element.JSLG_MPRT_ARRIVAL_PORT_NAME && ssList[ssUpdateIndex].VESSEL === element.JSLG_MVSL_VESSEL_CODE_NAME)
        if (!isVesselInSS) {
            shipsoftSailing = await searchSailing(ssList[ssUpdateIndex], shipsoftSailing);
        }
        updateVesselSailing(ssList, ssUpdateIndex, shipsoftSailing);
    } else {
        shipsoftSailing = await searchSailing(ssList[ssUpdateIndex], []);
        updateVesselSailing(ssList, ssUpdateIndex, shipsoftSailing);

    }

}
function getCutOffDate(etaDate) {
    const eta = new Date(etaDate);
    const cutOff = new Date(eta);

    // Sunday = 0, Monday = 1
    const day = eta.getDay();

    if (day === 1) {
        // Monday ETA → Friday cutoff
        cutOff.setDate(cutOff.getDate() - 3);
    } else if (day === 0) {
        // Sunday ETA → Friday cutoff
        cutOff.setDate(cutOff.getDate() - 2);
    } else {
        // Other days → previous day
        cutOff.setDate(cutOff.getDate() - 1);
    }

    // Format YYYY-MM-DD
    const yyyy = cutOff.getFullYear();
    const mm = cutOff.toLocaleString('en-US', { month: 'short' });
    const dd = String(cutOff.getDate()).padStart(2, '0');

    return `${dd}-${mm}-${yyyy}`;
}
async function addSSDetailsToFormData(singleSailing) {
    let vesselFormdata = {
        "JSLG_RID": "",
        "JSLG_SAILING_STATUS": "Active",
        "UPDATE_MFDATA": "Y",
        "JSLG_IS_CO_LOADER": "",//COLOAD SCHEDULE
        "JSLG_HAS_LCL": "", //CONSOL SCHEDULE
        "JSLG_HAS_FCL": "N",
        "JSLG_MOTHER_FEEDER_TYPE": "Mother",
        "JSLG_MVSL_VESSEL_CODE_TEXT": "",// UPDATE VESSEL NAME (TEXT) 
        "JSLG_MVSL_VESSEL_ID": "",// UPDATE VESSEL ID
        "JSLG_MVSL_VESSEL_NAME": "",// UPDATE VESSEL NAME (TEXT)
        "JSLG_MVSL_VESSEL_CODE": "",// UPDATE VESSEL NAME (CODE)
        "temp_vessel_lov_list": {},
        "JSLG_VOYAGE_NO": "", // UPDATE VOYAGE
        "JSLG_MPRT_ORIGIN_PORT_TEXT": "",
        "JSLG_MPRT_DEPARTURE_PORT_TEXT": "SGSIN",
        "POL_ID": "SGSIN",
        "JSLG_MPRT_DEPARTURE_PORT": "SGSIN",
        "JSLG_MPRT_DEPARTURE_PORT_NAME": "SINGAPORE",
        "JSLG_MPRT_FDC_PORT_TEXT": "",
        "JSLG_MPRT_ARRIVAL_PORT_TEXT": "", // UPDATE POD CODE
        "POD_ID": "",// UPDATE POD CODE
        "JSLG_MPRT_ARRIVAL_PORT": "",// UPDATE POD CODE
        "JSLG_MPRT_ARRIVAL_PORT_NAME": "",// UPDATE POD TEXT
        "JSLG_ORGN_CARRIER_NAME_TEXT": "", // UPDATE CARRIER
        "JSLG_ORGN_CARRIER": "", // CARRIER ID  
        "temp_carrier_lov_list": {},
        "JSLG_CONTAINER_RELEASE_NUMBER": "TBA", // CARRIER REF NO
        "JSLG_DEPARTURE_PORT_ETA": "", // ETA_POL format 25-May-26
        "JSLG_E_DEPARTURE_DATE": "", // ETD_POL
        "JSLG_E_ARRIVAL_DATE": "", // ETA_POD
        "JSLG_CUTOFF": "",  // POL CUT OFF
        "JSLG_IS_PUBLISHED_ON_WEB": true, // PUBLISH ON WEB
        "button_rights": false,
        "JSLG_SI_CUTTOFF": "",
        "JSLG_A_DEPARTURE_DATE": "",
        "JSLG_A_ARRIVAL_DATE": "",
        "JSLG_FDC_ETA": "",
        "JSLG_POD_ETD": ""
    }, { vesselList, podList, consolMode } = await chrome.storage.local.get(['vesselList', 'podList', "consolMode"]);
    /* example single sailing to update 
    sailingDetails - {
    ETA_POD : "18-may-2026"
    ETA_POL : "14-may-2026"
    ETD_POL : "14-may-2026"
    POD_CODE: "IDSUB"
    POD_TEXT : "SURABAYA"
    VESSEL: "BRIDGE"
    VOYAGE : "364S"
    }
    vesselist - [{code: "APL IRIS", id: "14526", text: "APL IRIS"},.....]
    podList - [{MPRT_IS_ICD: "N", code: "CNTAO", id: "", text: "QINGDAO"},.....]
    */
    let dbMatchVSL = vesselList.find(vsl => singleSailing.VESSEL === vsl.text),
        dbMatchPOD;
    if (singleSailing.POD_CODE) {
        dbMatchPOD = podList.filter(POD => POD.code === singleSailing.POD_CODE.toUpperCase());
        dbMatchPOD = dbMatchPOD.find(POD => POD.text === singleSailing.POD_TEXT.toUpperCase().trim())
    } else {
        dbMatchPOD = podList.find(POD => POD.text === singleSailing.POD_TEXT.toUpperCase().trim());
    }

    if (!dbMatchPOD || !dbMatchPOD.code) {

        return { status: "POD_NOT_AVAILABLE", msg: "Unable to find POD in system!" };
    }
    if (!dbMatchVSL) return { status: "VESSEL_NOT_AVAILABLE", VESSEL: singleSailing.VESSEL };

    // adding console mode details.
    vesselFormdata.JSLG_IS_CO_LOADER = consolMode.coload ? "Y" : "N";
    vesselFormdata.JSLG_HAS_LCL = consolMode.consol ? "Y" : "N";
    // adding Vessel details to update. 
    vesselFormdata.JSLG_MVSL_VESSEL_CODE_TEXT = dbMatchVSL.text;
    vesselFormdata.JSLG_MVSL_VESSEL_ID = dbMatchVSL.id;
    vesselFormdata.JSLG_MVSL_VESSEL_NAME = dbMatchVSL.text;
    vesselFormdata.JSLG_MVSL_VESSEL_CODE = dbMatchVSL.code;
    vesselFormdata.JSLG_MVSL_VESSEL_CODE_NAME = dbMatchVSL.text

    vesselFormdata.JSLG_VOYAGE_NO = singleSailing.VOYAGE;
    //update POD port details
    vesselFormdata.JSLG_MPRT_ARRIVAL_PORT_TEXT = dbMatchPOD.code;
    vesselFormdata.POD_ID = dbMatchPOD.code;
    vesselFormdata.JSLG_MPRT_ARRIVAL_PORT = dbMatchPOD.code;
    vesselFormdata.JSLG_MPRT_ARRIVAL_PORT_NAME = dbMatchPOD.text;

    // udpate ETA , ETD , ETA POD.
    vesselFormdata.JSLG_DEPARTURE_PORT_ETA = singleSailing.ETA_POL || singleSailing.ETD_POL; // if ETA date not available then update ETD for POL
    vesselFormdata.JSLG_E_DEPARTURE_DATE = singleSailing.ETD_POL || singleSailing.ETA_POL; // if ETD POL not available then update ETA POL;
    vesselFormdata.JSLG_E_ARRIVAL_DATE = singleSailing.ETA_POD;

    // setting cutt off date.
    if (singleSailing.ETA_CUTOFF) {
        vesselFormdata.JSLG_CUTOFF = singleSailing.ETA_CUTOFF;
    } else {
        vesselFormdata.JSLG_CUTOFF = getCutOffDate(singleSailing.ETA_POL || singleSailing.ETD_POL);
    }
    if (singleSailing.CARRIER) {
        vesselFormdata.JSLG_ORGN_CARRIER_NAME_TEXT = singleSailing.CARRIER.text || "";
        vesselFormdata.JSLG_ORGN_CARRIER = singleSailing.CARRIER.id || "";
    }


    return { status: "success", vesselFormdata };


}
async function updateVesselSailing(ssList, index, keyedSailing) {

    let singleSailing = ssList[index], response, isVesselInSS = keyedSailing.find(element => singleSailing.POD_TEXT.toUpperCase() === element.JSLG_MPRT_ARRIVAL_PORT_NAME && singleSailing.VESSEL === element.JSLG_MVSL_VESSEL_CODE_NAME && singleSailing.VOYAGE === element.JSLG_VOYAGE_NO);

    if (isVesselInSS) {

        await chrome.runtime.sendMessage(
            {
                action: "UPDATE_PROGRESS",
                ssUpdateIndex: index,
                sailingLength: ssList.length,
                updateText: "already available!",
                classType: "non_danger"
            });
        if (index === (ssList.length - 1)) {

            // this is the end.
            await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
            await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
        } else {
            // chrome
            await chrome.storage.local.set({ extensionStatus: "RUNNING", ssUpdateIndex: index + 1 });
            ssUpdating();
        }
    } else {
        response = await addSSDetailsToFormData(singleSailing);

        if (response.status === "success") {
            let updateResult = await updateSailingDB(response.vesselFormdata);

            if (response.status === "ERR"
            ) {
                await chrome.runtime.sendMessage({ action: "UPDATE_PROGRESS", ssUpdateIndex: index, sailingLength: ssList.length, updateText: response.msg, classType: "non_danger" });
            } else {
                await chrome.runtime.sendMessage({ action: "UPDATE_PROGRESS", ssUpdateIndex: index, sailingLength: ssList.length, updateText: "Done!", classType: "non_danger" });
            }

            if (index === ssList.length - 1) {
                // this is the end.
                await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
                await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
            } else {
                await chrome.storage.local.set({ extensionStatus: "RUNNING", ssUpdateIndex: index + 1 });
                ssUpdating();

            }
            // if schedule available -- {status: 'ERR', msg: 'Should not allow Sailing schedule with same vessel name and voyage.'}
        } else if (response.status === "VESSEL_NOT_AVAILABLE") {
            chrome.runtime.sendMessage({ action: "VESSEL_NOT_AVAILABLE", VESSEL: response.VESSEL })

        } else if (response.status === "POD_NOT_AVAILABLE") {
            await chrome.runtime.sendMessage(
                {
                    action: "UPDATE_PROGRESS",
                    ssUpdateIndex: index,
                    sailingLength: ssList.length,
                    updateText: response.msg,
                    classType: "non_danger"
                });
            if (index === ssList.length - 1) {
                // this is the end.
                await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
                await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
            } else {
                await chrome.storage.local.set({ extensionStatus: "RUNNING", ssUpdateIndex: index + 1 });
                ssUpdating();

            }


        }
    }

}

async function createNewVessel(vessel) {


    let { ssList, ssUpdateIndex } = await chrome.storage.local.get(["ssList", "ssUpdateIndex"]);
    // CHECKING IF VESSEL AVAILABLE.
    let vslStatus = await fetch('https://cs.shipsoft.co/shipsoft_dev/frt_master_controller/search_vessel_list', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "search_type": "Name", "search_value": ssList[ssUpdateIndex].VESSEL,
            "session": JSON.parse(localStorage.getItem("ffsession"))
        })
    }), getCompleteVessel;

    vslStatus = await vslStatus.json();

    if (vslStatus.status === "OK" && ssList[ssUpdateIndex].VESSEL === vslStatus.list_data[0].MVSL_NAME) {

        if (ssUpdateIndex === (ssList.length - 1)) {
            // this is the end.
            await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
            await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
        } else {
            // chrome
            ssUpdating();
        }
    } else {

        // inserting vessel to Db
        vslStatus = await fetch('https://cs.shipsoft.co/shipsoft_dev/frt_master_controller/add_update_vessel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "MVSL_STATUS": "Active", "MVSL_NAME": ssList[ssUpdateIndex].VESSEL, "MVSL_CODE": ssList[ssUpdateIndex].VESSEL,
                "session": JSON.parse(localStorage.getItem("ffsession"))
            })
        });
        vslStatus = await vslStatus.json();
        getCompleteVessel = await getVessel();
        if (vslStatus.status === "ERR") {
            await chrome.runtime.sendMessage({
                action: "UPDATE_PROGRESS",
                ssUpdateIndex: ssUpdateIndex,
                sailingLength: ssList.length,
                updateText: "Unable to create Vessel!", classType: "danger"
            });

            if (ssUpdateIndex === (ssList.length - 1)) {

                // this is the end.
                await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
                await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
            } else {

                ssUpdating();
            }
        } else {
            if (ssUpdateIndex === (ssList.length - 1)) {

                // this is the end.
                await chrome.storage.local.set({ extensionStatus: "ENDED", ssUpdateIndex: 0 });
                await chrome.runtime.sendMessage({ action: "SCHEDULE_DONE" })
            } else {
                // chrome

                ssUpdating();
            }
        }

    }

}



async function updateSailingDB(vesselFormdata) {
    try {
        let response = await fetch('https://cs.shipsoft.co/shipsoft_dev/sailing_api/SaveSailing/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "MFData": vesselFormdata,
                "Leg1Data": {
                    "UPDATE_LEG1DATA": "N",
                    "JSLG_DEPARTURE_PORT_ETA": "",
                    "JSLG_A_DEPARTURE_DATE": "",
                    "JSLG_E_DEPARTURE_DATE": "",
                    "JSLG_A_ARRIVAL_DATE": "",
                    "JSLG_E_ARRIVAL_DATE": ""
                },
                "Leg2Data": {
                    "UPDATE_LEG2DATA": "N",
                    "JSLG_DEPARTURE_PORT_ETA": "",
                    "JSLG_A_DEPARTURE_DATE": "",
                    "JSLG_E_DEPARTURE_DATE": "",
                    "JSLG_A_ARRIVAL_DATE": "",
                    "JSLG_E_ARRIVAL_DATE": ""
                },
                "SessData": JSON.parse(localStorage.getItem("ffsession"))
            })
        });

        return response = await response.json();


    } catch (error) {

        return {
            error
        }
    }
}

function dateFilter(ETA_POL, type) {

    const date = new Date(ETA_POL);
    // Set to previous month
    if (type === "STARTDATE"
    ) {
        date.setMonth(date.getMonth() - 1);
        // Set date as 30
        date.setDate(30);
    } else {
        date.setMonth(date.getMonth() + 1);
    }
    return date.toISOString();
}

async function searchSailing(vesselOption, shipSoftAvailableSailing) {

    let searchOption = {
        "search_type1": "Vessel Name",
        "search_type2": "Voyage",
        "search_date_type": "Cutoff",
        "search_value1": vesselOption.VOYAGE.toUpperCase(),
        "search_value": vesselOption.VESSEL.toUpperCase(),
        "session_mcpy": "54",
        "CHECK_DATE_COND": "Y",
        "SEARCH_TYPE_1": "Vessel Name",
        "SEARCH_TYPE_2": "Voyage",
        "DATE_COND": "POL ETD",
        "POL": null,
        "POD": null,
        "DEST": null,
        "search_date": "302",
        "date_name": "All Records",
        "from_date": dateFilter(vesselOption.ETA_POL || vesselOption.ETD_POL, "STARTDATE"),
        "to_date": dateFilter(vesselOption.ETA_POL || vesselOption.ETD_POL, "ENDDATE"),
        "search_value_origin": "SINGAPORE",
        "JSLG_MPRT_DEPARTURE_PORT_NAME": "",
        "search_value_dest": vesselOption.POD_TEXT.toUpperCase(),
        "session": JSON.parse(localStorage.getItem("ffsession"))
    }
    try {
        let response = await fetch("https://cs.shipsoft.co/shipsoft_dev/sailing_api/SailingListSearch/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(searchOption)
        }), data = await response.json();
        if (data.status === "OK") {
            await chrome.storage.local.set({ shipsoftSailing: shipSoftAvailableSailing.concat(data.res) });
            return shipSoftAvailableSailing.concat(data.res);
        } else {
            return shipSoftAvailableSailing;
        }
    } catch (error) {

        return shipSoftAvailableSailing;
    }


}
// function to find the port by tecxt

function findPortByText(array, searchText) {
    return array.find(
        item => item.text.toLowerCase() === searchText.toLowerCase()
    );
}

function findVesselByName(array, searchText) {
    return array.find(
        item => item.text.toLowerCase() === searchText.toLowerCase()
    );
}

