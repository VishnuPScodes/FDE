import xml.etree.ElementTree as ET

def parse_customer_ids(xml_text):
    return [node.text for node in ET.fromstring(xml_text).findall(".//Customer/Id")]
