CREATE TABLE regions (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE provinces (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE cities (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region_id VARCHAR(36) NOT NULL,
    province_id VARCHAR(36),
    is_municipality TINYINT(1) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE barangays (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region_id VARCHAR(36) NOT NULL,
    city_id VARCHAR(36) NOT NULL,
    province_id VARCHAR(36),
    PRIMARY KEY (id)
);