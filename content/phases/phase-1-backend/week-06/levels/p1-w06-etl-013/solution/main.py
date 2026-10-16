import xml.etree.ElementTree as ET

def parse_customer_ids(xml_text):
    root = ET.fromstring(xml_text)
    result = []
    for customer in root.iter():
        if customer.tag.split("}")[-1] == "Customer":
            for child in customer:
                if child.tag.split("}")[-1] == "Id" and child.text:
                    result.append(child.text)
    return result
