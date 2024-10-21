import fs from "fs/promises";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

async function scrape(link: string) {
	const response = await fetch(link);
	const result = await response.text();

	const dom = new JSDOM(result);

	const lguTable = dom.window.document.querySelector("#lguTable");
	const tbody = lguTable?.querySelector("tbody");

	if (!lguTable || !tbody) {
		return [];
	}

	return Array.from(tbody.children).map((child) => {
		const targetChild = child.children[0];

		const result: {
			name: string;
			nextLink: string;
			type?: "municipality" | "city" | "province";
		} = {
			name: (targetChild.textContent || "").replace(/\s+/gim, " "),
			nextLink: (targetChild.children[0] as HTMLLinkElement).href,
		};

		if (!result.name) {
			throw new Error("Cannot resolve name");
		}

		if (!result.nextLink) {
			throw new Error(
				`Could not resolve next link for "${result.name}" was not found`,
			);
		}

		const type = child.children[1].textContent?.split(/\s+/gim)[0] || "";

		if (["mun", "municipality", "city", "province"].includes(type)) {
			result.type =
				type === "mun"
					? "municipality"
					: (type as "municipality" | "city" | "province");
		}

		return result;
	});
}

interface JSONOutput {
	regions: Array<{
		id: number;
		name: string;
	}>;
	provinces: Array<{
		id: number;
		name: string;
		region_id: number;
	}>;
	cities: Array<{
		id: number;
		name: string;
		region_id: number;
		province_id: number | null;
		is_municipality: boolean;
	}>;
	barangays: Array<{
		id: number;
		name: string;
		region_id: number;
		city_id: number | null;
		province_id: number | null;
	}>;
}

interface SQLOutput {
	regions: string[];
	provinces: string[];
	cities: string[];
	barangays: string[];
}

async function main() {
	const jsonOutput: JSONOutput = {
		regions: [],
		cities: [],
		provinces: [],
		barangays: [],
	};

	const sqlOutput: SQLOutput = {
		regions: [],
		provinces: [],
		cities: [],
		barangays: [],
	};

	let regionId = 0;
	let provinceId = 0;
	let cityId = 0;
	let barangayId = 0;

	const regions = await scrape("https://www.philatlas.com/regions.html");
	await Promise.all(
		regions.map(async (region) => {
			regionId++;

			jsonOutput.regions.push({
				id: regionId,
				name: region.name,
			});

			sqlOutput.regions.push(
				`insert into regions (id, name) values (${regionId}, "${region.name}");`,
			);

			const provinces = await scrape(region.nextLink);

			await Promise.all(
				provinces.map(async (province) => {
					if (province.type === "province") {
						provinceId++;

						jsonOutput.provinces.push({
							id: provinceId,
							name: province.name,
							region_id: regionId,
						});

						sqlOutput.provinces.push(
							`insert into provinces (id, name, region_id) values (${provinceId}, "${province.name}", ${regionId});`,
						);

						const cities = await scrape(province.nextLink);

						await Promise.all(
							cities.map(async (city) => {
								cityId++;

								jsonOutput.cities.push({
									id: cityId,
									name: city.name,
									region_id: regionId,
									province_id: provinceId,
									is_municipality: city.type === "municipality",
								});

								sqlOutput.cities.push(
									`insert into cities (id, name, region_id, province_id, is_municipality) values (${cityId}, "${city.name}", ${regionId}, ${provinceId}, ${city.type === "municipality"});`,
								);

								const barangays = await scrape(province.nextLink);

								barangays.forEach((barangay) => {
									barangayId++;

									jsonOutput.barangays.push({
										id: barangayId,
										name: barangay.name,
										region_id: regionId,
										city_id: cityId,
										province_id: provinceId,
									});

									sqlOutput.barangays.push(
										`insert into barangays (id, name, region_id, city_id, province_id) values (${barangayId}, "${barangay.name}", ${regionId}, ${cityId}, ${provinceId});`,
									);
								});
							}),
						);
					} else {
						cityId++;

						jsonOutput.cities.push({
							id: cityId,
							name: province.name,
							region_id: regionId,
							is_municipality: province.type === "municipality",
							province_id: null,
						});

						sqlOutput.cities.push(
							`insert into cities (id, name, region_id, province_id, is_municipality) values (${cityId}, "${province.name}", ${regionId}, NULL, ${province.type === "municipality"});`,
						);

						const barangays = await scrape(province.nextLink);

						barangays.forEach((barangay) => {
							barangayId++;

							jsonOutput.barangays.push({
								id: barangayId,
								name: barangay.name,
								region_id: regionId,
								city_id: cityId,
								province_id: null,
							});

							sqlOutput.barangays.push(
								`insert into barangays (id, name, region_id, city_id, province_id) values (${barangayId}, "${barangay.name}", ${regionId}, ${cityId}, NULL);`,
							);
						});
					}
				}),
			);
		}),
	);

	await Promise.all([
		// json outputs
		fs.writeFile(
			"./outputs/json/regions.json",
			JSON.stringify(jsonOutput.regions, null, 4),
		),
		fs.writeFile(
			"./outputs/json/provinces.json",
			JSON.stringify(jsonOutput.provinces, null, 4),
		),
		fs.writeFile(
			"./outputs/json/cities.json",
			JSON.stringify(jsonOutput.cities, null, 4),
		),
		fs.writeFile(
			"./outputs/json/barangays.json",
			JSON.stringify(jsonOutput.barangays, null, 4),
		),

		// sql outputs
		fs.writeFile("./outputs/sql/regions.sql", sqlOutput.regions.join("\n")),
		fs.writeFile("./outputs/sql/provinces.sql", sqlOutput.provinces.join("\n")),
		fs.writeFile("./outputs/sql/cities.sql", sqlOutput.cities.join("\n")),
		fs.writeFile("./outputs/sql/barangays.sql", sqlOutput.barangays.join("\n")),
	]);

	/**
	 * Last run:
	 * Total of 17 regions.
	 * Total of 81 provinces.
	 * Total of 1,635 cities.
	 * Total of 44,811 barangays.
	 */
	console.log(`Total of ${sqlOutput.regions.length.toLocaleString()} regions.`);
	console.log(
		`Total of ${sqlOutput.provinces.length.toLocaleString()} provinces.`,
	);
	console.log(`Total of ${sqlOutput.cities.length.toLocaleString()} cities.`);
	console.log(
		`Total of ${sqlOutput.barangays.length.toLocaleString()} barangays.`,
	);
}

await main();
