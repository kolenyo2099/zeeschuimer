zeeschuimer.register_module(
    "linkedin.com",
    function (response, source_platform_url, source_url) {
        let domain = source_platform_url.split("/")[2].toLowerCase().replace(/^www\./, '');
        if (domain !== 'linkedin.com') {
            return [];
        }

        const sigil = '{&quot;data&quot;:{&quot;metadata&quot;';
        let data;
        try {
            data = JSON.parse(response);
        } catch (SyntaxError) {
            if(response.indexOf(sigil) >= 0) {
                // is html
                const embedded_json = sigil + response.split(sigil).pop().split('\n')[0];
                if (!embedded_json) {
                    return [];
                }

                try {
                    console.log(he.decode(embedded_json));
                    data = JSON.parse(he.decode(embedded_json));
                } catch (SyntaxError) {
                    return [];
                }
            } else {
                return [];
            }
        }

        if ("data" in data && "included" in data) {
            let item_key = '';
            if("results" in data["data"]) {
                item_key = 'results';
            } else if("*elements" in data["data"]) {
                item_key = "*elements"
            } else {
                return [];
            }

            // XHR updates
            // there is a list of objects, each with an ID
            // and a separate list of items to display, a list of those IDs
            // so the first step is to map item IDs to objects
            let mapped_objects = [];


            data["included"].forEach(object => {
                mapped_objects[object["entityUrn"]] = object;
            });

            // then we get the objects with the IDs in the item list
            // and that is our result set!
            let items = [];
            for (let object_ref in data["data"][item_key]) {
                let result = data["data"][item_key][object_ref];

                if (typeof result !== 'string') {
                    continue;
                }

                if (result.indexOf('urn:li:fs_updateV2:(') !== 0) {
                    continue;
                }

                let result_object = recursively_enrich(mapped_objects[result], mapped_objects);
                result_object["id"] = result;

                items.push(result_object);
            }

            return items;
        } else {
            return [];
        }
    }
)

function recursively_enrich(object, mapped_objects) {
    if(typeof(object) != 'object') {
        return object;
    }

    for(let field in object) {
        if(typeof field === 'string' && field.indexOf('*') === 0) {
            if(typeof object[field] === 'string' && object[field].indexOf('urn:') === 0) {
                // singular reference
                object[field] = recursively_enrich(mapped_objects[object[field]], mapped_objects);
            }

            else if (typeof object[field] === 'object') {
                // list of references
                for(let i in object[field]) {
                    if(typeof object[field][i] === 'string' && object[field][i].indexOf('urn:') === 0) {
                        object[field][i] = recursively_enrich(mapped_objects[object[field]], mapped_objects);
                    }
                }
            }
        } else {
            object[field] = recursively_enrich(object[field], mapped_objects);
        }
    }

    return object;
}