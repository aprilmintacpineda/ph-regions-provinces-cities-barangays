import { init } from "@paralleldrive/cuid2";
import fs from "fs/promises";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

export const generateId = init({ length: 36 });

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
		id: string;
		name: string;
	}>;
	provinces: Array<{
		id: string;
		name: string;
		region_id: string;
	}>;
	cities: Array<{
		id: string;
		name: string;
		region_id: string;
		province_id: string | null;
		is_municipality: boolean;
	}>;
	barangays: Array<{
		id: string;
		name: string;
		region_id: string;
		city_id: string | null;
		province_id: string | null;
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

	const now = new Date().toISOString();
	const regions = await scrape("https://www.philatlas.com/regions.html");
	await Promise.all(
		regions.map(async (region) => {
			const regionId = generateId();

			jsonOutput.regions.push({
				id: regionId,
				name: region.name,
			});

			sqlOutput.regions.push(
				`("${regionId}", "${region.name}", "${now}", "${now}")`,
			);

			const provinces = await scrape(region.nextLink);

			await Promise.all(
				provinces.map(async (province) => {
					if (province.type === "province") {
						const provinceId = generateId();

						jsonOutput.provinces.push({
							id: provinceId,
							name: province.name,
							region_id: regionId,
						});

						sqlOutput.provinces.push(
							`("${provinceId}", "${province.name}", "${regionId}", "${now}", "${now}")`,
						);

						const cities = await scrape(province.nextLink);

						await Promise.all(
							cities.map(async (city) => {
								const cityId = generateId();

								jsonOutput.cities.push({
									id: cityId,
									name: city.name,
									region_id: regionId,
									province_id: provinceId,
									is_municipality: city.type === "municipality",
								});

								sqlOutput.cities.push(
									`("${cityId}", "${city.name}", "${regionId}", "${provinceId}", ${city.type === "municipality"}, "${now}", "${now}")`,
								);

								const barangays = await scrape(city.nextLink);

								barangays.forEach((barangay) => {
									const barangayId = generateId();

									jsonOutput.barangays.push({
										id: barangayId,
										name: barangay.name,
										region_id: regionId,
										city_id: cityId,
										province_id: provinceId,
									});

									sqlOutput.barangays.push(
										`("${barangayId}", "${barangay.name}", "${regionId}", "${cityId}", "${provinceId}", "${now}", "${now}")`,
									);
								});
							}),
						);
					} else {
						const cityId = generateId();

						jsonOutput.cities.push({
							id: cityId,
							name: province.name,
							region_id: regionId,
							is_municipality: province.type === "municipality",
							province_id: null,
						});

						sqlOutput.cities.push(
							`("${cityId}", "${province.name}", "${regionId}", NULL, ${province.type === "municipality"}, "${now}", "${now}")`,
						);

						const barangays = await scrape(province.nextLink);

						barangays.forEach((barangay) => {
							const barangayId = generateId();

							jsonOutput.barangays.push({
								id: barangayId,
								name: barangay.name,
								region_id: regionId,
								city_id: cityId,
								province_id: null,
							});

							sqlOutput.barangays.push(
								`("${barangayId}", "${barangay.name}", "${regionId}", "${cityId}", NULL, "${now}", "${now}")`,
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
		fs.writeFile(
			"./outputs/sql/regions.sql",
			`insert into regions (id, name, created_at, updated_at) values ${sqlOutput.regions.join(",")};`,
		),
		fs.writeFile(
			"./outputs/sql/provinces.sql",
			`insert into provinces (id, name, region_id, created_at, updated_at) values ${sqlOutput.provinces.join(",")};`,
		),
		fs.writeFile(
			"./outputs/sql/cities.sql",
			`insert into cities (id, name, region_id, province_id, is_municipality, created_at, updated_at) values ${sqlOutput.cities.join(",")};`,
		),
		fs.writeFile(
			"./outputs/sql/barangays.sql",
			`insert into barangays (id, name, region_id, city_id, province_id, created_at, updated_at) values ${sqlOutput.barangays.join(",")};`,
		),
	]);

	/**
	 * Last run:
	 * Total of 17 regions.
	 * Total of 81 provinces.
	 * Total of 1,635 cities.
	 * Total of 42,091 barangays.
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
