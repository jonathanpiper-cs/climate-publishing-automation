// Function to compare climate forecast information against comparison fields in deal entry.
const compareDealToClimate = (dealComparison, climateValue) => {
    const enable = dealComparison.enable;
    const operator = dealComparison.comparison;
    const dealValue = dealComparison.value;
    if (enable) {
        if (operator === 'GTE' && climateValue >= dealValue) {
            return true;
        } else if (operator === 'LTE' && climateValue <= dealValue) {
            return true;
        } else {
            return false;
        }
    }
    return false;
}

// Function to determine if deal is available in region.
const compareDealToRegion = (dealRegionArray, region) => {
    if (dealRegionArray.indexOf(region) != -1) {
        return true;
    }
}

// Define object to be returned.
let returnObject = {
    climateByRegion: [],
    publish: [],
    unpublish: []
}

// These arrays will temporarily hold UIDs for (un)publishing.
let dealsToPublish = [];
let dealsToUnpublish = [];

// Set some input variables. "input.[abc]" refers to a variable defined in the Automation Hub step's input.
const regions = input.regions;
const deals = input.deals;

// Headers for using the Content Management API.
const headers = {
    authtoken: input.authtoken,
    api_key: 'bltadff757a5e860112',
    authorization: 'cs8b480f92bd0bd05f1237df9f',
    'Content-Type': 'application/json'
}

// Create date object for forecast reference.
const d = new Date();
const dFull = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');

// Get the details of the 'production' environment.
const envrequest = await fetch("https://api.contentstack.io/v3/environments?include_count=false&asc=created_at&desc=updated_at", { headers })
const envjson = await envrequest.json();
const prodenv = envjson.environments.filter(e => e.name === 'production')[0];

// Function for getting UIDs of deals to publish/unpublish.
const getDealsFromRegions = async () => {
    return Promise.all(
        regions.map(async (region) => {
            const city = region[0];
            const country = region[1];
            let coordsJson;
            let climateJson;
            try {
                // Free API for getting coordinates of cities.
                const coordsRequest = await fetch(`https://api.api-ninjas.com/v1/geocoding?city=${city}&country=${country}`, {
                    headers: {
                        'X-Api-Key': 'XUrbrR8ca+UgV3p9u6RHww==tmpzWslEkVw0BSZa'
                    }
                });
                coordsJson = await coordsRequest.json();
            } catch (err) {
                return err;
            }
            try {
                // Free API for getting climate forecasts. Just getting temperature for this example.
                const climateRequest = await fetch(`https://climate-api.open-meteo.com/v1/climate?latitude=${coordsJson[0].latitude}&longitude=${coordsJson[0].longitude}&start_date=${dFull}&end_date=${dFull}&daily=temperature_2m_max&models=MRI_AGCM3_2_S`);
                climateJson = await climateRequest.json();
                returnObject.climateByRegion.push([`${city}, ${country}`, climateJson.daily.temperature_2m_max[0]])
            } catch (err) {
                return err;
            }
            return deals.map(deal => {
                deal.climate_threshold.forEach((condition) => {
                    const conditionMet = compareDealToClimate(condition, climateJson.daily.temperature_2m_max[0]) && compareDealToRegion(deal.region_selection, city);
                    if (deal.publish_details.filter(e => e.environment === prodenv.uid).length === 0 && conditionMet) {
                        dealsToPublish.push(deal.uid);
                    } else if (deal.publish_details.filter(e => e.environment === prodenv.uid).length !== 0 && !conditionMet) {
                        dealsToUnpublish.push(deal.uid);
                    }
                });
            })
        }
        ))
}

function onlyUnique(value, index, array) {
    return array.indexOf(value) === index;
}

await getDealsFromRegions();

// Filtering the returned arrays to discard duplicates and invalid entries.
returnObject.publish = dealsToPublish.flat().filter(d => d !== undefined).filter(onlyUnique);
returnObject.unpublish = dealsToUnpublish.flat().filter(d => d !== undefined).filter(onlyUnique);

// Send the return object to the next step of the Automation.
return returnObject;