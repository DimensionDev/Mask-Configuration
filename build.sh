#!/usr/bin/env bash

mkdir -p ./temp
mkdir -p ./production

for f in ./types/*.ts
do 
    fn="${f##*/}" # file name with ext
    ff="${fn%.*}" # file name only

    echo "Validate $f in development/"
    npx typescript-json-schema ./types/$ff.ts Schema > ./temp/schema.json
    npx ajv validate -s ./temp/schema.json -d ./development/$ff.json > /dev/null

    echo "Depoly $ff to production/"
    cp ./development/$ff.json ./production/$ff.json
done

rm ./temp/schema.json
rmdir ./temp 